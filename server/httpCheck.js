import pool from "./db.js";
import fetch from "node-fetch";

const domains = [
    { name: "old.yummyani.me", apiKeyEnv: "GLOBALPING_API_KEY" },
    { name: "ru.yummyani.me", apiKeyEnv: "GLOBALPING_API_KEY2" },
    { name: "en.yummyani.me", apiKeyEnv: "GLOBALPING_API_KEY3" },
    { name: "site.yummy-ani.me", apiKeyEnv: "GLOBALPING_API_KEY4" },
];

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
                MODE() WITHIN GROUP (ORDER BY status_code) AS status_code,
                ROUND(AVG(total_time)::numeric, 2) AS total_time,
                ROUND(AVG(download_time)::numeric, 2) AS download_time,
                ROUND(AVG(first_byte_time)::numeric, 2) AS first_byte_time,
                ROUND(AVG(dns_time)::numeric, 2) AS dns_time,
                ROUND(AVG(tls_time)::numeric, 2) AS tls_time,
                ROUND(AVG(tcp_time)::numeric, 2) AS tcp_time,
                date_trunc('hour', NOW()) AS created_at
            FROM http_logs
            WHERE created_at >= NOW() - INTERVAL '1 hour'
            GROUP BY domain, country, city;
        `;

        await pool.query(query);
        console.log('Hourly aggregation completed successfully.');
    } catch (err) {
        console.error('Error during hourly aggregation:', err);
    }
};

// Хелпер для сохранения результата в БД
const saveResultToDb = async (id, target, country, city, asn, network, statusCode, totalTime, downloadTime, firstByteTime, dnsTime, tlsTime, tcpTime) => {
    let finalTotalTime = totalTime;

    // Если данных о времени нет (ошибка)
    if (finalTotalTime === null) {
        // Для ошибок типа "сбой пробы/сети" (код 599) или отсутствующих данных
        // мы берем время из последнего успешного замера, чтобы не портить график.
        if (statusCode === 599 || statusCode === null|| statusCode === 429) {
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
            // Для 408 (Timeout) и 503 (DNS) ставим жесткие 4000
            finalTotalTime = 4000;
        }
    }

    const query = `
      INSERT INTO http_logs (
        probe_id, domain, country, city, asn, network, status_code, total_time, download_time, first_byte_time, dns_time, tls_time, tcp_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;
    const values = [
        id, target, country, city, asn, network, statusCode,
        finalTotalTime !== null ? Math.min(finalTotalTime, 4000) : 4000,
        downloadTime, firstByteTime, dnsTime, tlsTime, tcpTime
    ];
    await pool.query(query, values);
};

// Функция для выполнения проверки HTTP и сохранения результатов для одного домена
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
                    await saveResultToDb("api_limit", target, location.country, location.city, null, null, 429, null, null, null, null, null, null);
                }
            } else {
                for (const location of locations) {
                    await saveResultToDb("failed", target, location.country, location.city, null, null, 599, null, null, null, null, null, null);
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

        for (const location of locations) {
            const result = resultsByLocation.get(
                `${location.city}-${location.country}`
            );

            if (result && result.result.status === "finished") {
                const { probe, result: httpResult } = result;
                
                console.log(
                    `[SUCCESS] HTTP check to ${probe.city}, ${probe.country} for ${target}: Status ${httpResult.statusCode}. ASN: ${probe.asn}, Network: ${probe.network}`
                );

                await saveResultToDb(
                    id, target, probe.country, probe.city, probe.asn, probe.network,
                    httpResult.statusCode, httpResult.timings.total, httpResult.timings.download,
                    httpResult.timings.firstByte, httpResult.timings.dns, httpResult.timings.tls, httpResult.timings.tcp
                );
            } else {
                const { probe } = result || {};
                const failureReason = result ? result.result.status : "unknown";
                
                console.log(`[FAILURE] HTTP check to ${location.city}, ${location.country} for ${target}: Status ${failureReason}`);
                
                let errorCode = 599;
                if (failureReason === "timed-out") errorCode = 408;
                if (failureReason === "dns-error") errorCode = 503;

                await saveResultToDb(
                    id, target, location.country, location.city, probe?.asn || null, probe?.network || null,
                    errorCode, null, null, null, null, null, null
                );
            }
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
            await saveResultToDb("failed", target, location.country, location.city, null, null, 599, null, null, null, null, null, null);
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
