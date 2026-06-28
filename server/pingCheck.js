import pool from "./db.js";
import fetch from "node-fetch";

const domains = [
    { name: "old.yummyani.me", apiKeyEnv: "GLOBALPING_API_KEY" },
    { name: "ru.yummyani.me", apiKeyEnv: "GLOBALPING_API_KEY2" },
    { name: "ru.yummy-ani.me", apiKeyEnv: "GLOBALPING_API_KEY3" },
    { name: "old.yummy-ani.me", apiKeyEnv: "GLOBALPING_API_KEY4" },
    { name: "api.yani.tv", apiKeyEnv: "GLOBALPING_API_KEY6" },
];

const pingLocation = { country: "RU", city: "Moscow" };

const GLOBALPING_MEASUREMENTS_URL = "https://api.globalping.io/v1/measurements";

const createMeasurementWithRetry = async (requestOptions, deadline) => {
    let attempt = 0;
    while (true) {
        const response = await fetch(GLOBALPING_MEASUREMENTS_URL, requestOptions);
        if (response.ok || response.status < 500) {
            return response;
        }
        const delay = Math.min(2000 * 2 ** attempt, 15000);
        if (Date.now() + delay >= deadline) {
            return response;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt += 1;
    }
};

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

const toPacketLossOrNull = (value) => {
    const numericValue = toNonNegativeNumberOrNull(value);
    if (numericValue === null) {
        return null;
    }

    return Math.min(numericValue, 100);
};

export const cleanupOldPingLogs = async () => {
    console.log(`--- Starting ping log cleanup at ${new Date().toISOString()} ---`);
    try {
        const detailedResult = await pool.query(
            `DELETE FROM ping_logs WHERE created_at < NOW() - INTERVAL '40 day';`
        );
        console.log(`Ping logs cleanup: deleted ${detailedResult.rowCount} rows from ping_logs.`);

        const hourlyResult = await pool.query(
            `DELETE FROM ping_hourly_logs WHERE created_at < NOW() - INTERVAL '40 day';`
        );
        console.log(`Ping hourly logs cleanup: deleted ${hourlyResult.rowCount} rows from ping_hourly_logs.`);
    } catch (err) {
        console.error('Error during ping log cleanup:', err);
    }
};

export const aggregateHourlyPingData = async () => {
    console.log(`--- Starting hourly ping aggregation at ${new Date().toISOString()} ---`);
    try {
        const query = `
            INSERT INTO ping_hourly_logs (
                domain, country, city, rtt_min, rtt_avg, rtt_max, packet_loss, created_at
            )
            SELECT
                domain,
                country,
                city,
                ROUND(AVG(CASE WHEN rtt_min >= 0 THEN rtt_min END)::numeric, 2) AS rtt_min,
                ROUND(AVG(CASE WHEN rtt_avg >= 0 THEN rtt_avg END)::numeric, 2) AS rtt_avg,
                ROUND(AVG(CASE WHEN rtt_max >= 0 THEN rtt_max END)::numeric, 2) AS rtt_max,
                ROUND(AVG(CASE WHEN packet_loss >= 0 THEN LEAST(packet_loss, 100) END)::numeric, 2) AS packet_loss,
                date_trunc('hour', NOW()) AS created_at
            FROM ping_logs
            WHERE created_at >= NOW() - INTERVAL '1 hour'
            GROUP BY domain, country, city;
        `;
        await pool.query(query);
        console.log('Hourly ping aggregation completed successfully.');
    } catch (err) {
        console.error('Error during hourly ping aggregation:', err);
    }
};

const savePingResultToDb = async (probeId, domain, country, city, asn, network, rttMin, rttAvg, rttMax, packetLoss) => {
    const query = `
      INSERT INTO ping_logs (
        probe_id, domain, country, city, asn, network, rtt_min, rtt_avg, rtt_max, packet_loss
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;
    const values = [
        probeId,
        domain,
        country,
        city,
        asn,
        network,
        toNonNegativeNumberOrNull(rttMin),
        toNonNegativeNumberOrNull(rttAvg),
        toNonNegativeNumberOrNull(rttMax),
        toPacketLossOrNull(packetLoss),
    ];
    await pool.query(query, values);
};

const pingDomain = async (domain, intervalMs) => {
    const target = domain.name;
    const apiKey = process.env[domain.apiKeyEnv];

    if (!apiKey) {
        console.error(`${domain.apiKeyEnv} is not set for ping.`);
        return;
    }

    try {
        const requestOptions = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                target: target,
                locations: [{ ...pingLocation, limit: 1 }],
                type: "ping",
                measurementOptions: {
                    packets: 3,
                },
            }),
        };

        const createRetryDeadline =
            Date.now() + Math.min(Math.floor(intervalMs / 2), 60000);
        const createResponse = await createMeasurementWithRetry(
            requestOptions,
            createRetryDeadline
        );

        if (!createResponse.ok) {
            const errorBody = await createResponse.text();
            console.error(`Failed to create ping measurement for ${target}: ${createResponse.status}. Body: ${errorBody}`);
            if (createResponse.status === 429) {
                await savePingResultToDb("api_limit", target, pingLocation.country, pingLocation.city, null, null, null, null, null, null);
            }
            return;
        }

        const { id } = await createResponse.json();
        console.log(`[PING] Measurement created for ${target} with ID: ${id}`);

        let resultData;
        const startTime = Date.now();
        const timeout = 60000;

        while (Date.now() - startTime < timeout) {
            const getResultResponse = await fetch(
                `${GLOBALPING_MEASUREMENTS_URL}/${id}`
            );

            if (!getResultResponse.ok) {
                if (getResultResponse.status >= 500) {
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    continue;
                }
                throw new Error(`HTTP error! status: ${getResultResponse.status}`);
            }

            resultData = await getResultResponse.json();

            if (resultData.status === "finished") {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        if (!resultData || resultData.status !== "finished") {
            throw new Error(`Ping measurement ${id} for ${target} did not complete in 60s.`);
        }

        const result = resultData.results[0];
        if (result && result.result.status === "finished") {
            const { probe, result: pingResult } = result;
            const stats = pingResult.stats;

            console.log(
                `[SUCCESS] Ping to ${probe.city}, ${probe.country} for ${target}: avg=${stats.avg}ms, loss=${stats.loss}%`
            );

            await savePingResultToDb(
                id, target, probe.country, probe.city,
                probe.asn, probe.network,
                stats.min, stats.avg, stats.max, stats.loss
            );
        } else {
            console.log(`[FAILURE] Ping to ${pingLocation.city}, ${pingLocation.country} for ${target}`);
            await savePingResultToDb(
                id, target, pingLocation.country, pingLocation.city,
                null, null, null, null, null, 100
            );
        }
    } catch (err) {
        console.error(`Failed ping measurement for ${target}:`, err.message);
        await savePingResultToDb("failed", target, pingLocation.country, pingLocation.city, null, null, null, null, null, 100);
    }
};

export const pingCheckAndSave = async (intervalMs) => {
    console.log(
        `--- Starting ping check cycle at ${new Date().toISOString()} for ${domains.length} domains ---`
    );
    await Promise.all(domains.map((domain) => pingDomain(domain, intervalMs)));
};
