import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    base: "./",
    plugins: [react()],
    server: {
        proxy: {
            "/logs": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
            "/http-logs": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
            "/locations": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
        },
    },
});
