import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
    Chart as ChartJS,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    TimeScale,
    TimeSeriesScale,
} from "chart.js";
import "chartjs-adapter-date-fns";
import { ru } from "date-fns/locale";
import CrosshairPlugin from "chartjs-plugin-crosshair";
import styles from "./OverviewChart.module.scss";

ChartJS.register(
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    CrosshairPlugin,
    TimeScale,
    TimeSeriesScale
);

interface Log {
    created_at: string;
    total_time?: number;
}

interface OverviewChartProps {
    allLogs: Log[];
    timeRange: string;
}

const OverviewChart: React.FC<OverviewChartProps> = ({ allLogs, timeRange }) => {
    const { chartData, avgTotal } = useMemo(() => {
        if (allLogs.length === 0) return { chartData: { datasets: [] }, avgTotal: 0 };

        // Группируем логи по времени
        const groupedByTime = allLogs.reduce((acc, log) => {
            const date = new Date(log.created_at);
            date.setSeconds(0, 0);
            const key = date.getTime();
            if (!acc[key]) acc[key] = [];
            acc[key].push(log.total_time || 0);
            return acc;
        }, {} as Record<number, number[]>);

        const sortedKeys = Object.keys(groupedByTime)
            .map(Number)
            .sort((a, b) => a - b);

        const data = sortedKeys.map((key) => {
            const values = groupedByTime[key];
            const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
            return { x: key, y: avg };
        });

        const totalSum = allLogs.reduce((sum, log) => sum + (log.total_time || 0), 0);
        const avgTotal = allLogs.length > 0 ? totalSum / allLogs.length : 0;

        return {
            chartData: {
                datasets: [
                    {
                        label: "Средняя скорость",
                        data: data,
                        borderColor: "#4caf50",
                        backgroundColor: "rgba(76, 175, 80, 0.2)",
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                    },
                ],
            },
            avgTotal,
        };
    }, [allLogs]);

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                mode: "index" as const,
                intersect: false,
            },
            crosshair: {
                enabled: false, // Отключаем, если не нужен, но прописываем конфиг
            },
        },
        scales: {
            x: {
                type: "time" as const,
                time: {
                    unit: (timeRange === "hour" ? "minute" : "hour") as "minute" | "hour",
                    displayFormats: {
                        minute: "HH:mm",
                        hour: "HH:mm",
                        day: "dd.MM",
                    },
                },
                adapters: { date: { locale: ru } },
                grid: { display: false },
                ticks: { color: "#888" },
            },
            y: {
                grid: { color: "rgba(255, 255, 255, 0.1)" },
                ticks: { color: "#888" },
            },
        },
    };

    return (
        <div className={styles.container}>
            <div className={styles.chartWrapper}>
                <Line data={chartData} options={options} />
            </div>
            <div className={styles.avgWrapper}>
                <span className={styles.avgLabel}>Средняя скорость</span>
                <span className={styles.avgValue}>{avgTotal.toFixed(0)}<small>мс</small></span>
            </div>
        </div>
    );
};

export default OverviewChart;
