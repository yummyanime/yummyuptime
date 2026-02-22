import dotenv from "dotenv";
dotenv.config();
import express from "express";
import path from "path";
import { createHttpTable } from "./db.js";
import apiRoutes from "./routes.js";
import {
    httpCheckAndSave,
    locationGroups,
    aggregateHourlyData,
    cleanupOldLogs,
} from "./httpCheck.js";

const __dirname = path.resolve();

const app = express();
const port = 3000;

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

    const runChecks = (locations) => {
        httpCheckAndSave(locations).catch((err) =>
            console.error("Check cycle failed:", err)
        );
    };

    runChecks(locationGroups["2min"]);
    aggregateHourlyData().catch((err) =>
        console.error("Initial aggregation failed:", err)
    );
    cleanupOldLogs().catch((err) =>
        console.error("Initial cleanup failed:", err)
    );

    // Scheduled runs
    setInterval(() => runChecks(locationGroups["2min"]), 3 * 60 * 1000);
    setInterval(() => runChecks(locationGroups["6min"]), 6 * 60 * 1000);
    setInterval(aggregateHourlyData, 60 * 60 * 1000); // Run hourly aggregation every hour (60 * 60 * 1000 ms)
    setInterval(cleanupOldLogs, 60 * 60 * 1000); // Run hourly cleanup every hour
});
