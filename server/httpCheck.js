import pool from "./db.js";
import { io } from "socket.io-client";

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
const saveResultToDb = async (id, target, country, city, asn, network, statusCode, totalTime, downloadTime, firstByteTime, dnsTime, tlsTime, tcpTime) => {
    const query = `
      INSERT INTO http_logs (
        probe_id, domain, country, city, asn, network, status_code, total_time, download_time, first_byte_time, dns_time, tls_time, tcp_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;
    const values = [
        id, target, country, city, asn, network, statusCode,
        totalTime !== null ? Math.min(totalTime, 4000) : 4000,
        downloadTime, firstByteTime, dnsTime, tlsTime, tcpTime
    ];
    await pool.query(query, values);
};

// Функция для выполнения проверки через WebSocket
const checkAndSaveDomainWS = (domain, locations) => {
    return new Promise((resolve) => {
        const target = domain.name;
        const apiKey = process.env[domain.apiKeyEnv];
        const secretKey = process.env.GLOBALPING_SECRET_KEY;

        if (!apiKey) {
            console.error(`${domain.apiKeyEnv} is not set.`);
            return resolve();
        }

        const socket = io("https://api.globalping.io", {
            transports: ["websocket"],
            auth: { token: apiKey }
        });

        let measurementId = null;
        const locationsMap = new Map(locations.map(l => [`${l.city}-${l.country}`, l]));
        const resultsReceived = new Set();

        socket.on("connect", () => {
            console.log(`[WS] Connected to Globalping for ${target}`);
            socket.emit("measurement:create", {
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
            });
        });

        socket.on("connect_error", (err) => {
            console.error(`[WS] Connection error for ${target}:`, err.message);
            socket.disconnect();
            resolve();
        });

        socket.on("measurement:created", (data) => {
            measurementId = data.id;
            console.log(`[WS] Measurement created for ${target} with ID: ${measurementId}`);
        });

        socket.on("measurement:result", async (data) => {
            if (data.id !== measurementId) return;

            const { probe, result: httpResult } = data.result;
            const locationKey = `${probe.city}-${probe.country}`;
            resultsReceived.add(locationKey);

            if (httpResult.status === "finished") {
                console.log(`[WS SUCCESS] ${probe.city}, ${probe.country} for ${target}: Status ${httpResult.statusCode}`);
                await saveResultToDb(
                    measurementId, target, probe.country, probe.city, probe.asn, probe.network,
                    httpResult.statusCode, httpResult.timings.total, httpResult.timings.download,
                    httpResult.timings.firstByte, httpResult.timings.dns, httpResult.timings.tls, httpResult.timings.tcp
                );
            } else {
                console.log(`[WS FAILURE] ${probe.city}, ${probe.country} for ${target}: Status ${httpResult.status}`);
                await saveResultToDb(
                    measurementId, target, probe.country, probe.city, probe.asn, probe.network,
                    null, 4000, null, null, null, null, null
                );
            }
        });

        socket.on("measurement:finished", () => {
            console.log(`[WS] All results received for ${target} (${measurementId})`);
            
            // Проверяем, есть ли локации, от которых не пришло ничего
            const remainingLocations = locations.filter(l => !resultsReceived.has(`${l.city}-${l.country}`));
            const cleanup = async () => {
                for (const loc of remainingLocations) {
                    await saveResultToDb(measurementId, target, loc.country, loc.city, null, null, null, 4000, null, null, null, null, null);
                }
                socket.disconnect();
                resolve();
            };
            cleanup();
        });

        // Таймаут безопасности на случай, если Globalping не пришлет 'finished'
        setTimeout(() => {
            if (socket.connected) {
                console.log(`[WS] Safety timeout for ${target} (${measurementId})`);
                socket.disconnect();
                resolve();
            }
        }, 120000);
    });
};

export const httpCheckAndSave = async (locations) => {
    console.log(
        `--- Starting HTTP check cycle (WebSocket) at ${new Date().toISOString()} for ${locations.length} locations across ${domains.length} domains ---`
    );
    
    // Запускаем проверки параллельно
    await Promise.all(
        domains.map((domain) => checkAndSaveDomainWS(domain, locations))
    );
    
    console.log(`--- All HTTP check cycles completed at ${new Date().toISOString()} ---`);
};
