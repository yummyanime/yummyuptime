import pool from "./db.js";
import fetch from "node-fetch";

export const INTERNAL_STATUS = {
    PROBE_FAIL: 901,
    TIMEOUT: 902,
    DNS_ERROR: 903,
    API_LIMIT: 904,
    PROBE_OFFLINE: 905,
    CONN_REFUSED: 906,
    TLS_ERROR: 907,
};

const classifyProbeFailure = (rawOutput) => {
    if (typeof rawOutput !== "string" || !rawOutput) {
        return INTERNAL_STATUS.PROBE_FAIL;
    }
    if (/ETIMEDOUT|timed?\s*out/i.test(rawOutput)) return INTERNAL_STATUS.TIMEOUT;
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|queryA?\b/i.test(rawOutput)) return INTERNAL_STATUS.DNS_ERROR;
    if (/ECONNREFUSED|ECONNRESET|EPIPE/i.test(rawOutput)) return INTERNAL_STATUS.CONN_REFUSED;
    if (/cert|tls|ssl|self.signed|ERR_TLS|DEPTH_ZERO/i.test(rawOutput)) return INTERNAL_STATUS.TLS_ERROR;
    return INTERNAL_STATUS.PROBE_FAIL;
};

export const domains = [
    { name: "old.yummyani.me", apiKeyEnv: "GLOBALPING_API_KEY" },
    { name: "ru.yummyani.me", apiKeyEnv: "GLOBALPING_API_KEY2" },
    { name: "en.yummyani.me", apiKeyEnv: "GLOBALPING_API_KEY3" },
    { name: "old.yummy-ani.me", apiKeyEnv: "GLOBALPING_API_KEY4" },
];

const toNonNegativeNumberOrNull = (value) => {
    if (value === null || value === undefined) {
        return null;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
        return null;
    }

    return numericValue;
};

const toStatusCodeOrNull = (value) => {
    const numericValue = toNonNegativeNumberOrNull(value);
    if (numericValue === null) {
        return null;
    }

    return Math.trunc(numericValue);
};

const pickHeaderCaseInsensitive = (headers, name) => {
    if (!headers || typeof headers !== "object") return null;
    const lower = name.toLowerCase();
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === lower) return headers[key];
    }
    return null;
};

export const parseServerTiming = (rawHeader) => {
    if (!rawHeader) return null;
    const headerStr = Array.isArray(rawHeader) ? rawHeader.join(",") : rawHeader;
    if (typeof headerStr !== "string" || !headerStr.trim()) return null;

    const result = {};
    let inQuotes = false;
    let buf = "";
    const entries = [];
    for (const ch of headerStr) {
        if (ch === '"') inQuotes = !inQuotes;
        if (ch === "," && !inQuotes) {
            entries.push(buf);
            buf = "";
        } else {
            buf += ch;
        }
    }
    if (buf.trim()) entries.push(buf);

    for (const entry of entries) {
        const parts = entry.split(";").map((p) => p.trim()).filter(Boolean);
        if (!parts.length) continue;
        const name = parts[0];
        if (!name) continue;
        let dur = null;
        for (const p of parts.slice(1)) {
            const eq = p.indexOf("=");
            if (eq === -1) continue;
            const k = p.slice(0, eq).trim().toLowerCase();
            let v = p.slice(eq + 1).trim();
            if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
            if (k === "dur") {
                const n = Number(v);
                if (Number.isFinite(n) && n >= 0) dur = n;
            }
        }
        if (dur !== null) {
            result[name] = Math.round(dur * 100) / 100;
        }
    }
    return Object.keys(result).length > 0 ? result : null;
};

export const locationGroups = {
    "2min": [
        { country: "RU", city: "Moscow" },
        { country: "RU", city: "Saint Petersburg" },
        { country: "RU", city: "Novosibirsk" },
        { country: "UA", city: "Kyiv" },
        { country: "UA", city: "Lviv" },
        { country: "UA", city: "Odesa" },
        { country: "KZ", city: "Almaty" },
        { country: "KZ", city: "Aktau" },
        { country: "BY", city: "Minsk" },
    ],
    "6min": [
        { country: "DE", city: "Berlin" },
        { country: "DE", city: "Dusseldorf" }, 
        { country: "KG", city: "Bishkek" },
        { country: "PL", city: "Warsaw" }, 
        { country: "PL", city: "Krakow" }, 
        { country: "LV", city: "Riga" },
        { country: "LT", city: "Vilnius" },
        { country: "LT", city: "Siauliai" },
        { country: "EE", city: "Tallinn" },
        { country: "US", city: "New York" },
        { country: "US", city: "Los Angeles" },
        { country: "NL", city: "Amsterdam" },
        { country: "NL", city: "Utrecht" },
        { country: "GB", city: "London" },
        { country: "MD", city: "Chisinau" },
        { country: "CZ", city: "Prague" },
        { country: "CZ", city: "Brno" },
        { country: "GE", city: "Tbilisi" },
        { country: "AM", city: "Yerevan" },
    ],
};

export const cleanupOldLogs = async () => {
    console.log(`--- Starting log cleanup at ${new Date().toISOString()} (Older than 40 days) ---`);
    try {
        const detailedQuery = `
            DELETE FROM http_logs
            WHERE created_at < NOW() - INTERVAL '40 day';
        `;
        const detailedResult = await pool.query(detailedQuery);
        console.log(`Detailed logs cleanup completed. Deleted ${detailedResult.rowCount} rows from http_logs.`);

        const hourlyQuery = `
            DELETE FROM http_hourly_logs
            WHERE created_at < NOW() - INTERVAL '40 day';
        `;
        const hourlyResult = await pool.query(hourlyQuery);
        console.log(`Hourly logs cleanup completed. Deleted ${hourlyResult.rowCount} rows from http_hourly_logs.`);
    } catch (err) {
        console.error('Error during log cleanup:', err);
    }
};

export const aggregateHourlyData = async () => {
    console.log(`--- Starting hourly aggregation at ${new Date().toISOString()} ---`);
    try {
        const query = `
            INSERT INTO http_hourly_logs (
                domain, country, city, status_code, total_time, download_time,
                first_byte_time, dns_time, tls_time, tcp_time, created_at
            )
            SELECT
                domain,
                country,
                city,
                MODE() WITHIN GROUP (ORDER BY status_code) FILTER (WHERE status_code >= 0) AS status_code,
                ROUND(AVG(CASE WHEN total_time >= 0 THEN total_time END)::numeric, 2) AS total_time,
                ROUND(AVG(CASE WHEN download_time >= 0 THEN download_time END)::numeric, 2) AS download_time,
                ROUND(AVG(CASE WHEN first_byte_time >= 0 THEN first_byte_time END)::numeric, 2) AS first_byte_time,
                ROUND(AVG(CASE WHEN dns_time >= 0 THEN dns_time END)::numeric, 2) AS dns_time,
                ROUND(AVG(CASE WHEN tls_time >= 0 THEN tls_time END)::numeric, 2) AS tls_time,
                ROUND(AVG(CASE WHEN tcp_time >= 0 THEN tcp_time END)::numeric, 2) AS tcp_time,
                date_trunc('hour', NOW()) AS created_at
            FROM http_logs
            WHERE created_at >= NOW() - INTERVAL '1 hour'
            GROUP BY domain, country, city;
        `;

        await pool.query(query);

        // Aggregate JSONB server_timing per (domain, country, city) for this hour
        // by averaging each metric key across all logs in the last hour.
        const serverTimingQuery = `
            WITH per_metric AS (
                SELECT
                    l.domain, l.country, l.city,
                    j.key,
                    AVG((j.value)::numeric) AS avg_val
                FROM http_logs l
                CROSS JOIN LATERAL jsonb_each_text(l.server_timing) j
                WHERE l.created_at >= NOW() - INTERVAL '1 hour'
                  AND l.server_timing IS NOT NULL
                GROUP BY l.domain, l.country, l.city, j.key
            ),
            timing_agg AS (
                SELECT
                    domain, country, city,
                    jsonb_object_agg(key, ROUND(avg_val, 2)) AS server_timing
                FROM per_metric
                GROUP BY domain, country, city
            )
            UPDATE http_hourly_logs h
            SET server_timing = ta.server_timing
            FROM timing_agg ta
            WHERE h.domain = ta.domain
              AND h.country = ta.country
              AND h.city = ta.city
              AND h.created_at = date_trunc('hour', NOW());
        `;
        await pool.query(serverTimingQuery);

        console.log('Hourly aggregation completed successfully.');
    } catch (err) {
        console.error('Error during hourly aggregation:', err);
    }
};

const saveResultToDb = async (
    id,
    target,
    country,
    city,
    asn,
    network,
    statusCode,
    totalTime,
    downloadTime,
    firstByteTime,
    dnsTime,
    tlsTime,
    tcpTime,
    shouldIgnore599 = true,
    serverTiming = null
) => {
    let finalTotalTime = totalTime;

    if (finalTotalTime === null) {
        const isProbeInfraFailure =
            statusCode === INTERNAL_STATUS.PROBE_FAIL ||
            statusCode === INTERNAL_STATUS.PROBE_OFFLINE;
        if ((isProbeInfraFailure && shouldIgnore599) || statusCode === null || statusCode === INTERNAL_STATUS.API_LIMIT) {
            try {
                const lastLogQuery = `
                    SELECT total_time 
                    FROM http_logs 
                    WHERE domain = $1 AND country = $2 AND city = $3 AND total_time IS NOT NULL AND status_code = 200
                    ORDER BY created_at DESC 
                    LIMIT 1
                `;
                const lastLogResult = await pool.query(lastLogQuery, [target, country, city]);
                if (lastLogResult.rows.length > 0) {
                    finalTotalTime = lastLogResult.rows[0].total_time;
                } else {
                    finalTotalTime = 4000;
                }
            } catch (err) {
                console.error('Error fetching last log for fallback time:', err);
                finalTotalTime = 4000;
            }
        } else {
            finalTotalTime = 4000;
        }
    }

    const query = `
      INSERT INTO http_logs (
        probe_id, domain, country, city, asn, network, status_code, total_time, download_time, first_byte_time, dns_time, tls_time, tcp_time, server_timing
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `;
    const safeTotalTime = toNonNegativeNumberOrNull(finalTotalTime);
    const values = [
        id,
        target,
        country,
        city,
        asn,
        network,
        toStatusCodeOrNull(statusCode),
        safeTotalTime !== null ? Math.min(safeTotalTime, 4000) : 4000,
        toNonNegativeNumberOrNull(downloadTime),
        toNonNegativeNumberOrNull(firstByteTime),
        toNonNegativeNumberOrNull(dnsTime),
        toNonNegativeNumberOrNull(tlsTime),
        toNonNegativeNumberOrNull(tcpTime),
        serverTiming ? JSON.stringify(serverTiming) : null,
    ];
    await pool.query(query, values);
};

const checkAndSaveDomain = async (domain, locations) => {
    const target = domain.name;
    const apiKey = process.env[domain.apiKeyEnv];
    const secretKey = process.env.GLOBALPING_SECRET_KEY;

    if (!apiKey) {
        console.error(`${domain.apiKeyEnv} is not set.`);
        return;
    }

    if (!target) {
        console.error("Target is not defined");
        return;
    }

    try {
        // Step 1: Create the measurement
        const requestOptions = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                target: target,
                locations: locations.map((location) => ({
                    ...location,
                    limit: 1,
                })),
                type: "http",
                measurementOptions: {
                    protocol: "HTTPS",
                    ...(secretKey && {
                        request: {
                            headers: {
                                "X-Secret-Key": secretKey,
                            },
                        },
                    }),
                },
            }),
        };
        const createMeasurementResponse = await fetch(
            "https://api.globalping.io/v1/measurements",
            requestOptions
        );

        if (!createMeasurementResponse.ok) {
            const errorBody = await createMeasurementResponse.text();
            console.error(
                `Failed to create measurement for ${target}: ${createMeasurementResponse.status} ${createMeasurementResponse.statusText}. Body: ${errorBody}`
            );
            if (createMeasurementResponse.status === 429) {
                for (const location of locations) {
                    await saveResultToDb("api_limit", target, location.country, location.city, null, null, INTERNAL_STATUS.API_LIMIT, null, null, null, null, null, null);
                }
            } else {
                for (const location of locations) {
                    await saveResultToDb("failed", target, location.country, location.city, null, null, INTERNAL_STATUS.PROBE_FAIL, null, null, null, null, null, null, false);
                }
            }
            return;
        }

        const { id } = await createMeasurementResponse.json();
        console.log(`[HTTP] Measurement created for ${target} with ID: ${id}`);

        // Step 2 & 3: Poll for the measurement result until it's finished
        let resultData;
        const startTime = Date.now();
        const timeout = 120000; // 120 seconds timeout

        while (Date.now() - startTime < timeout) {
            const getResultResponse = await fetch(
                `https://api.globalping.io/v1/measurements/${id}`
            );

            if (!getResultResponse.ok) {
                if (getResultResponse.status >= 500) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, 2000)
                    );
                    continue;
                }
                throw new Error(
                    `HTTP error! status: ${getResultResponse.status}`
                );
            }

            resultData = await getResultResponse.json();

            if (resultData.status === "finished") {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        if (!resultData || resultData.status !== "finished") {
            throw new Error(`Measurement ${id} for ${target} did not complete in 120s.`);
        }

        const resultsByLocation = new Map(
            resultData.results.map((r) => [
                `${r.probe.city}-${r.probe.country}`,
                r,
            ])
        );

        const resultsToSave = locations.map((location) => {
            const result = resultsByLocation.get(
                `${location.city}-${location.country}`
            );

            if (result && result.result.status === "finished") {
                const { probe, result: httpResult } = result;
                const serverTimingHeader = pickHeaderCaseInsensitive(
                    httpResult.headers,
                    "server-timing"
                );

                return {
                    location,
                    probe,
                    statusCode: httpResult.statusCode,
                    totalTime: httpResult.timings.total,
                    downloadTime: httpResult.timings.download,
                    firstByteTime: httpResult.timings.firstByte,
                    dnsTime: httpResult.timings.dns,
                    tlsTime: httpResult.timings.tls,
                    tcpTime: httpResult.timings.tcp,
                    serverTiming: parseServerTiming(serverTimingHeader),
                    isSuccess: true,
                };
            }

            const { probe } = result || {};
            const probeStatus = result ? result.result.status : "unknown";
            const rawOutput = result ? result.result.rawOutput : null;

            let errorCode;
            if (probeStatus === "offline") {
                errorCode = INTERNAL_STATUS.PROBE_OFFLINE;
            } else {
                errorCode = classifyProbeFailure(rawOutput);
            }
            const failureReason = rawOutput
                ? `${probeStatus}: ${String(rawOutput).slice(0, 120)}`
                : probeStatus;

            return {
                location,
                probe,
                statusCode: errorCode,
                totalTime: null,
                downloadTime: null,
                firstByteTime: null,
                dnsTime: null,
                tlsTime: null,
                tcpTime: null,
                serverTiming: null,
                failureReason,
                isSuccess: false,
            };
        });

        const shouldIgnore599 = resultsToSave.some(
            (result) =>
                result.statusCode !== INTERNAL_STATUS.PROBE_FAIL &&
                result.statusCode !== INTERNAL_STATUS.PROBE_OFFLINE
        );

        for (const result of resultsToSave) {
            if (result.isSuccess) {
                console.log(
                    `[SUCCESS] HTTP check to ${result.probe.city}, ${result.probe.country} for ${target}: Status ${result.statusCode}. ASN: ${result.probe.asn}, Network: ${result.probe.network}`
                );
            } else {
                console.log(`[FAILURE] HTTP check to ${result.location.city}, ${result.location.country} for ${target}: Status ${result.failureReason}`);
            }

            await saveResultToDb(
                id,
                target,
                result.probe?.country || result.location.country,
                result.probe?.city || result.location.city,
                result.probe?.asn || null,
                result.probe?.network || null,
                result.statusCode,
                result.totalTime,
                result.downloadTime,
                result.firstByteTime,
                result.dnsTime,
                result.tlsTime,
                result.tcpTime,
                shouldIgnore599,
                result.serverTiming
            );
        }
        console.log(
            `--- HTTP check cycle for measurement ${id} completed. ---`
        );
    } catch (err) {
        console.error(
            `Failed to complete HTTP measurement cycle for ${target}:`,
            err.message
        );
        for (const location of locations) {
            await saveResultToDb("failed", target, location.country, location.city, null, null, INTERNAL_STATUS.PROBE_FAIL, null, null, null, null, null, null, false);
        }
    }
};

export const httpCheckAndSave = async (locations) => {
    console.log(
        `--- Starting HTTP check cycle at ${new Date().toISOString()} for ${locations.length} locations across ${domains.length} domains ---`
    );
    await Promise.all(
        domains.map((domain) => checkAndSaveDomain(domain, locations))
    );
};
