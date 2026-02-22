import pool from "./db.js";
import fetch from "node-fetch";

const domains = [
    { name: "site.yummyani.me", apiKeyEnv: "GLOBALPING_API_KEY" },
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
const saveResultToDb = async (id, target, country, city, asn, network, statusCode, totalTime, downloadTime, firstByteTime, dns_time, tls_time, tcp_time) => {
    let finalTotalTime = totalTime;

    // Если данных о времени нет (ошибка)
    if (finalTotalTime === null) {
        // Для ошибок типа "сбой пробы/сети" (код 599) или отсутствующих данных
        // мы берем время из последнего успешного замера, чтобы не портить график.
        if (statusCode === 599 || statusCode === null) {
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
        downloadTime, firstByteTime, dns_time, tls_time, tcp_time
    ];
    await pool.query(query, values);
};

// Функция для выполнения проверки HTTP (Long Polling)
const checkAndSaveDomain = async (domain, locations) => {
    const target = domain.name;
    const apiKey = process.env[domain.apiKeyEnv];
    const secretKey = process.env.GLOBALPING_SECRET_KEY;

    if (!apiKey) {
        console.error(`${domain.apiKeyEnv} is not set.`);
        return;
    }

    try {
        // Используем ?wait=true для получения результатов в одном запросе
        const requestOptions = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                target: target,
                type: "http",
                locations: locations.map((location) => ({
                    ...location,
                    limit: 1,
                })),
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

        console.log(`[HTTP] Creating measurement for ${target} with wait=true...`);
        const response = await fetch(
            "https://api.globalping.io/v1/measurements?wait=true",
            requestOptions
        );

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[HTTP ERROR] ${target}: ${response.status}. Body: ${errorBody}`);
            
            // Если лимит запросов (429), помечаем все локации
            if (response.status === 429) {
                for (const loc of locations) {
                    await saveResultToDb("api_limit", target, loc.country, loc.city, null, null, 429, null, null, null, null, null, null);
                }
            } else {
                for (const loc of locations) {
                    await saveResultToDb("failed", target, loc.country, loc.city, null, null, 599, null, null, null, null, null, null);
                }
            }
            return;
        }

        const data = await response.json();
        const measurementId = data.id;
        console.log(`[HTTP SUCCESS] Measurement completed for ${target}, ID: ${measurementId}`);

        for (const resultEntry of data.results) {
            const { probe, result: httpResult } = resultEntry;
            
            if (httpResult.status === "finished") {
                console.log(`[HTTP] ${probe.city}, ${probe.country} for ${target}: ${httpResult.statusCode}`);
                await saveResultToDb(
                    measurementId, target, probe.country, probe.city, probe.asn, probe.network,
                    httpResult.statusCode, httpResult.timings.total, httpResult.timings.download,
                    httpResult.timings.firstByte, httpResult.timings.dns, httpResult.timings.tls, httpResult.timings.tcp
                );
            } else {
                console.log(`[HTTP FAILURE] ${probe.city}, ${probe.country} for ${target}: ${httpResult.status}`);
                let errorCode = 599;
                if (httpResult.status === "timed-out") errorCode = 408;
                if (httpResult.status === "dns-error") errorCode = 503;

                await saveResultToDb(
                    measurementId, target, probe.country, probe.city, probe.asn, probe.network,
                    errorCode, null, null, null, null, null, null
                );
            }
        }
    } catch (err) {
        console.error(`[HTTP FATAL] ${target}:`, err.message);
        for (const loc of locations) {
            await saveResultToDb("fatal_error", target, loc.country, loc.city, null, null, 599, null, null, null, null, null, null);
        }
    }
};

export const httpCheckAndSave = async (locations) => {
    console.log(
        `--- Starting HTTP check cycle at ${new Date().toISOString()} for ${locations.length} locations across ${domains.length} domains ---`
    );
    
    // Запускаем проверки параллельно
    await Promise.all(
        domains.map((domain) => checkAndSaveDomain(domain, locations))
    );
    
    console.log(`--- All HTTP check cycles completed at ${new Date().toISOString()} ---`);
};
