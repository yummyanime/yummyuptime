process.env.TZ = "UTC";

import dotenv from "dotenv";
dotenv.config();
import express from "express";
import compression from "compression";
import path from "path";
import { createHttpTable } from "./db.js";
import apiRoutes from "./routes.js";
import {
    httpCheckAndSave,
    locationGroups,
    aggregateHourlyData,
    cleanupOldLogs,
} from "./httpCheck.js";
import {
    pingCheckAndSave,
    aggregateHourlyPingData,
    cleanupOldPingLogs,
} from "./pingCheck.js";
import {
    lighthouseCheckAndSave,
    aggregateHourlyLighthouseData,
    cleanupOldLighthouseLogs,
} from "./lighthouseCheck.js";

const __dirname = path.resolve();

const app = express();
const port = 3000;

app.use(compression());

app.use(express.json());

app.use(apiRoutes);


// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'client/dist')));

// All other GET requests not handled by the API will return your React app
app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'client', 'dist', 'index.html'));
});

app.listen(port, async () => {
    console.log(`Server listening at http://localhost:${port}`);
    await createHttpTable();

    const runChecks = (locations, intervalMs) => {
        httpCheckAndSave(locations, intervalMs).catch((err) =>
            console.error("Check cycle failed:", err)
        );
    };

    runChecks(locationGroups["2min"], 2 * 60 * 1000);
    pingCheckAndSave(2 * 60 * 1000).catch((err) =>
        console.error("Initial ping check failed:", err)
    );
    aggregateHourlyData().catch((err) =>
        console.error("Initial aggregation failed:", err)
    );
    aggregateHourlyPingData().catch((err) =>
        console.error("Initial ping aggregation failed:", err)
    );
    cleanupOldLogs().catch((err) =>
        console.error("Initial cleanup failed:", err)
    );
    cleanupOldPingLogs().catch((err) =>
        console.error("Initial ping cleanup failed:", err)
    );
    lighthouseCheckAndSave().catch((err) =>
        console.error("Initial Lighthouse check failed:", err)
    );
    aggregateHourlyLighthouseData().catch((err) =>
        console.error("Initial Lighthouse aggregation failed:", err)
    );
    cleanupOldLighthouseLogs().catch((err) =>
        console.error("Initial Lighthouse cleanup failed:", err)
    );

    // Scheduled runs
    setInterval(() => runChecks(locationGroups["2min"], 2 * 60 * 1000), 2 * 60 * 1000);
    setInterval(() => runChecks(locationGroups["6min"], 6 * 60 * 1000), 6 * 60 * 1000);
    setInterval(() => pingCheckAndSave(2 * 60 * 1000).catch((err) => console.error("Ping check failed:", err)), 2 * 60 * 1000);
    setInterval(() => lighthouseCheckAndSave().catch((err) => console.error("Lighthouse check failed:", err)), 6 * 60 * 1000);
    setInterval(aggregateHourlyData, 60 * 60 * 1000);
    setInterval(aggregateHourlyPingData, 60 * 60 * 1000);
    setInterval(aggregateHourlyLighthouseData, 60 * 60 * 1000);
    setInterval(cleanupOldLogs, 60 * 60 * 1000);
    setInterval(cleanupOldPingLogs, 60 * 60 * 1000);
    setInterval(cleanupOldLighthouseLogs, 60 * 60 * 1000);
});
