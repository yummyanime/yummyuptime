import express from "express";
import pool from "./db.js";
import { locationGroups, domains as monitoredDomains } from "./httpCheck.js";

const router = express.Router();

const HOURLY_THRESHOLD_MS = 48 * 60 * 60 * 1000;

const TIME_RANGE_CONFIG = {
    month: { interval: "30 day", spanMs: 30 * 24 * 60 * 60 * 1000 },
    week: { interval: "7 day", spanMs: 7 * 24 * 60 * 60 * 1000 },
    day: { interval: "1 day", spanMs: 24 * 60 * 60 * 1000 },
    "3hour": { interval: "3 hour", spanMs: 3 * 60 * 60 * 1000 },
};

const parseDate = (raw) => {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
};

const buildTimeFilter = ({ type, timeRange, dateFrom, dateTo }) => {
    const from = parseDate(dateFrom);
    const to = parseDate(dateTo);

    if (from && to && from < to) {
        const spanMs = to.getTime() - from.getTime();
        const useHourly = spanMs >= HOURLY_THRESHOLD_MS;
        const tableName =
            type === "http"
                ? useHourly
                    ? "http_hourly_logs"
                    : "http_logs"
                : useHourly
                  ? "ping_hourly_logs"
                  : "ping_logs";
        return {
            tableName,
            whereSql: "created_at >= $1 AND created_at <= $2",
            params: [from.toISOString(), to.toISOString()],
        };
    }

    const cfg = TIME_RANGE_CONFIG[timeRange] ?? TIME_RANGE_CONFIG["3hour"];
    const useHourly = cfg.spanMs >= HOURLY_THRESHOLD_MS;
    const tableName =
        type === "http"
            ? useHourly
                ? "http_hourly_logs"
                : "http_logs"
            : useHourly
              ? "ping_hourly_logs"
              : "ping_logs";
    return {
        tableName,
        whereSql: "created_at >= NOW() - $1::interval",
        params: [cfg.interval],
    };
};

router.get("/http-logs", async (req, res) => {
    try {
        const { timeRange, domain, dateFrom, dateTo } = req.query;

        const { tableName, whereSql, params } = buildTimeFilter({
            type: "http",
            timeRange,
            dateFrom,
            dateTo,
        });

        const columns = `country, city, status_code, created_at, total_time, download_time, first_byte_time, dns_time, tls_time, tcp_time, server_timing`;

        let query;
        let queryParams;

        if (domain) {
            query = `
        SELECT
          ${columns}
        FROM ${tableName}
        WHERE ${whereSql} AND city IS NOT NULL AND domain = $${params.length + 1}
        ORDER BY created_at ASC;
      `;
            queryParams = [...params, domain];
        } else {
            query = `
        SELECT
          domain, ${columns}
        FROM ${tableName}
        WHERE ${whereSql} AND city IS NOT NULL
        ORDER BY created_at ASC;
      `;
            queryParams = params;
        }

        const { rows } = await pool.query(query, queryParams);

        if (domain) {
            const logsByCountryCity = {};
            for (const row of rows) {
                const { country, city, ...logData } = row;
                if (!logsByCountryCity[country]) {
                    logsByCountryCity[country] = {};
                }
                if (!logsByCountryCity[country][city]) {
                    logsByCountryCity[country][city] = [];
                }
                logsByCountryCity[country][city].push(logData);
            }
            res.json(logsByCountryCity);
        } else {
            res.json(rows);
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

router.get("/ping-logs", async (req, res) => {
    try {
        const { timeRange, domain, dateFrom, dateTo } = req.query;

        const { tableName, whereSql, params } = buildTimeFilter({
            type: "ping",
            timeRange,
            dateFrom,
            dateTo,
        });

        const columns = `domain, country, city, rtt_avg, rtt_min, rtt_max, packet_loss, created_at`;

        let query;
        let queryParams;

        if (domain) {
            query = `
                SELECT ${columns}
                FROM ${tableName}
                WHERE ${whereSql} AND city IS NOT NULL AND domain = $${params.length + 1}
                ORDER BY created_at ASC;
            `;
            queryParams = [...params, domain];
        } else {
            query = `
                SELECT ${columns}
                FROM ${tableName}
                WHERE ${whereSql} AND city IS NOT NULL
                ORDER BY created_at ASC;
            `;
            queryParams = params;
        }

        const { rows } = await pool.query(query, queryParams);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

router.get("/locations", (req, res) => {
    res.json(locationGroups);
});

const PROBE_ERROR_CODE = 900;
const SLOW_RESPONSE_MS = 1500;

const isProblematicResult = (r) =>
    Number(r.status_code) < PROBE_ERROR_CODE &&
    (r.status_code !== 200 ||
        r.total_time === null ||
        (r.total_time !== null && r.total_time > SLOW_RESPONSE_MS));

const getBucketStatus = (results) => {
    const relevant = results.filter(
        (r) => Number(r.status_code) < PROBE_ERROR_CODE
    );
    const probeErrorCount = results.filter(
        (r) => Number(r.status_code) >= PROBE_ERROR_CODE
    ).length;

    if (probeErrorCount > 0 && relevant.length === 0) return "PROBE_ERROR";

    const captchaCount = relevant.filter(
        (r) => Number(r.status_code) === 202
    ).length;
    if (captchaCount > 0) return "CAPTCHA";

    const problematic = relevant.filter(isProblematicResult).length;

    if (relevant.length > 0 && problematic === relevant.length) return "DOWN";
    if (problematic >= 3) return "DEGRADED_HIGH";
    if (problematic === 1) return "DEGRADED_LOW";
    if (problematic >= 2) return "DEGRADED_MEDIUM";
    return "UP";
};

const UP_STATUSES = new Set([
    "UP",
    "DEGRADED_LOW",
    "DEGRADED_MEDIUM",
    "DEGRADED_HIGH",
    "CAPTCHA",
]);

router.get("/status-summary", async (req, res) => {
    try {
        const count = Math.min(
            Math.max(parseInt(req.query.count, 10) || 24, 1),
            500
        );

        const { rows } = await pool.query(
            `
            SELECT domain, country, city, status_code, total_time, created_at
            FROM http_logs
            WHERE created_at >= NOW() - $1::interval AND city IS NOT NULL
            ORDER BY created_at ASC;
            `,
            ["24 hour"]
        );

        const byDomain = {};
        for (const row of rows) {
            if (!byDomain[row.domain]) byDomain[row.domain] = [];
            byDomain[row.domain].push(row);
        }

        const domainData = {};
        for (const [domain, logs] of Object.entries(byDomain)) {
            const buckets = new Map();
            for (const log of logs) {
                const key = new Date(log.created_at)
                    .toISOString()
                    .substring(0, 16);
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push(log);
            }

            const orderedKeys = [...buckets.keys()].sort();
            const statuses = orderedKeys.map((k) =>
                getBucketStatus(buckets.get(k))
            );

            const consideredBuckets = statuses.filter((s) => s !== "PROBE_ERROR");
            const upBuckets = consideredBuckets.filter((s) =>
                UP_STATUSES.has(s)
            ).length;
            const uptime24h = consideredBuckets.length
                ? upBuckets / consideredBuckets.length
                : null;

            const validTimes = logs
                .filter(
                    (l) =>
                        Number(l.status_code) < PROBE_ERROR_CODE &&
                        l.total_time !== null
                )
                .map((l) => l.total_time);
            const avgResponseMs = validTimes.length
                ? Math.round(
                      validTimes.reduce((a, b) => a + b, 0) / validTimes.length
                  )
                : null;

            domainData[domain] = {
                current: statuses[statuses.length - 1] ?? "PROBE_ERROR",
                heartbeats: statuses.slice(-count),
                ...(uptime24h !== null && { uptime24h }),
                ...(avgResponseMs !== null && { avgResponseMs }),
            };
        }

        const domains = monitoredDomains
            .filter(({ name }) => domainData[name])
            .map(({ name }) => ({ domain: name, ...domainData[name] }));

        res.json({ updatedAt: new Date().toISOString(), domains });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

export default router;
