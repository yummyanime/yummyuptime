import React, { useMemo, useState } from "react";
import Chart from "../../../Chart/Chart.tsx";
import Button from "../../../Button/Button.tsx";
import {
    backendMetricPreset,
    httpRequestTimePreset,
    pingPreset,
} from "../../../Chart/chartPresets.ts";
import styles from "./OverviewChart.module.scss";

interface Log {
    created_at: string;
    domain?: string;
    total_time?: number;
    rtt_avg?: number;
    packet_loss?: number;
    status_code?: number;
    download_time?: number;
    first_byte_time?: number;
    dns_time?: number;
    tls_time?: number;
    tcp_time?: number;
    unreliable?: boolean;
    server_timing?: Record<string, number> | null;
}

interface PingLog {
    created_at: string;
    domain?: string;
    rtt_avg?: number;
    rtt_min?: number;
    rtt_max?: number;
    packet_loss?: number;
}

interface OverviewChartProps {
    allLogs: Log[];
    pingLogs: PingLog[];
    timeRange: string;
    domain?: string;
}

type OverviewTab = "loadTime" | "ping" | "backend";

const OverviewChart: React.FC<OverviewChartProps> = ({ allLogs, pingLogs, timeRange, domain }) => {
    const [activeTab, setActiveTab] = useState<OverviewTab>(
        () => (localStorage.getItem("overviewTab") as OverviewTab) || "loadTime"
    );

    const handleTabChange = (value: string) => {
        const tab = value as OverviewTab;
        setActiveTab(tab);
        localStorage.setItem("overviewTab", tab);
    };

    const processedLoadTime = useMemo(() => {
        if (!allLogs || allLogs.length === 0) return { cityLogs: {} as Record<string, Log[]>, avgTotal: 0 };

        const validLogs = allLogs.filter(log => log.total_time !== undefined);

        if (validLogs.length === 0) return { cityLogs: {} as Record<string, Log[]>, avgTotal: 0 };

        const avgTotal = validLogs.reduce((acc, log) => acc + (log.total_time || 0), 0) / validLogs.length;

        const cityLogs: Record<string, Log[]> = {
            ["Средняя"]: validLogs
        };

        return { cityLogs, avgTotal };
    }, [allLogs]);

    const processedPing = useMemo(() => {
        if (!pingLogs || pingLogs.length === 0) return { cityLogs: {} as Record<string, any[]>, avgPing: 0 };

        if (domain) {
            // На странице домена — показываем простое время пинга (не среднее по доменам)
            const validLogs = pingLogs.filter(log => log.rtt_avg !== undefined && log.rtt_avg !== null);
            if (validLogs.length === 0) return { cityLogs: {} as Record<string, any[]>, avgPing: 0 };

            const avgPing = validLogs.reduce((acc, log) => acc + (log.rtt_avg || 0), 0) / validLogs.length;

            const mapped = validLogs.map(log => ({
                created_at: log.created_at,
                total_time: log.rtt_avg,
                rtt_min: log.rtt_min,
                rtt_max: log.rtt_max,
                packet_loss: log.packet_loss,
            }));

            return {
                cityLogs: { ["Ping"]: mapped } as Record<string, any[]>,
                avgPing,
            };
        } else {
            // На главной — среднее по всем доменам за каждую минуту
            const validLogs = pingLogs.filter(log => log.rtt_avg !== undefined && log.rtt_avg !== null);
            if (validLogs.length === 0) return { cityLogs: {} as Record<string, any[]>, avgPing: 0 };

            const avgPing = validLogs.reduce((acc, log) => acc + (log.rtt_avg || 0), 0) / validLogs.length;

            // Группируем по минуте и усредняем по доменам
            const byMinute: Record<string, PingLog[]> = {};
            for (const log of validLogs) {
                const date = new Date(log.created_at);
                date.setSeconds(0, 0);
                const key = date.toISOString();
                if (!byMinute[key]) byMinute[key] = [];
                byMinute[key].push(log);
            }

            const averaged = Object.entries(byMinute)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, logs]) => ({
                    created_at: key,
                    total_time: logs.reduce((sum, l) => sum + (l.rtt_avg || 0), 0) / logs.length,
                    rtt_min: logs.reduce((sum, l) => sum + (l.rtt_min || 0), 0) / logs.length,
                    rtt_max: logs.reduce((sum, l) => sum + (l.rtt_max || 0), 0) / logs.length,
                    packet_loss: logs.reduce((sum, l) => sum + (l.packet_loss || 0), 0) / logs.length,
                }));

            return {
                cityLogs: { ["Средняя"]: averaged } as Record<string, any[]>,
                avgPing,
            };
        }
    }, [pingLogs, domain]);

    const processedBackend = useMemo(() => {
        if (!allLogs || allLogs.length === 0) {
            return { cityLogs: {} as Record<string, any[]>, metricAvgs: {} as Record<string, number> };
        }

        const useHourBucket = timeRange === "week" || timeRange === "month";
        const buckets: Record<number, Record<string, { sum: number; count: number }>> = {};

        for (const log of allLogs) {
            if (!log.server_timing || typeof log.server_timing !== "object") continue;
            const date = new Date(log.created_at);
            if (useHourBucket) {
                date.setMinutes(0, 0, 0);
            } else {
                date.setSeconds(0, 0);
            }
            const key = date.getTime();
            if (!buckets[key]) buckets[key] = {};

            for (const [metric, value] of Object.entries(log.server_timing)) {
                const num = Number(value);
                if (!Number.isFinite(num)) continue;
                if (!buckets[key][metric]) buckets[key][metric] = { sum: 0, count: 0 };
                buckets[key][metric].sum += num;
                buckets[key][metric].count += 1;
            }
        }

        const allMetrics = new Set<string>();
        for (const k of Object.keys(buckets)) {
            for (const m of Object.keys(buckets[Number(k)])) allMetrics.add(m);
        }
        const metricNames = Array.from(allMetrics);

        const sortedKeys = Object.keys(buckets).map(Number).sort((a, b) => a - b);
        const cityLogs: Record<string, any[]> = {};
        const metricTotals: Record<string, { sum: number; count: number }> = {};

        for (const metric of metricNames) {
            cityLogs[metric] = sortedKeys.map((key) => {
                const entry = buckets[key][metric];
                const avg = entry ? entry.sum / entry.count : null;
                if (avg !== null) {
                    if (!metricTotals[metric]) metricTotals[metric] = { sum: 0, count: 0 };
                    metricTotals[metric].sum += avg;
                    metricTotals[metric].count += 1;
                }
                return {
                    created_at: new Date(key).toISOString(),
                    total_time: avg,
                };
            });
        }

        const metricAvgs: Record<string, number> = {};
        for (const [metric, { sum, count }] of Object.entries(metricTotals)) {
            metricAvgs[metric] = count > 0 ? sum / count : 0;
        }

        return { cityLogs, metricAvgs };
    }, [allLogs, timeRange]);

    const hasBackendData = !!domain && Object.keys(processedBackend.cityLogs).length > 0;
    const effectiveTab: OverviewTab = activeTab === "backend" && !hasBackendData ? "loadTime" : activeTab;
    const isLoadTime = effectiveTab === "loadTime";
    const isPingTab = effectiveTab === "ping";
    const isBackend = effectiveTab === "backend";

    const currentData = isLoadTime
        ? processedLoadTime.cityLogs
        : isBackend
            ? processedBackend.cityLogs
            : processedPing.cityLogs;
    const currentAvg = isLoadTime ? processedLoadTime.avgTotal : processedPing.avgPing;
    const currentCities = isLoadTime
        ? ["Средняя"]
        : isBackend
            ? Object.keys(processedBackend.cityLogs)
            : Object.keys(processedPing.cityLogs);

    const tabOptions: { value: OverviewTab; label: string }[] = [
        { value: "loadTime", label: "Время загрузки" },
        { value: "ping", label: "Ping" },
        ...(hasBackendData
            ? [{ value: "backend" as OverviewTab, label: "Backend" }]
            : []),
    ];

    return (
        <div className={styles.container}>
            <div className={styles.tabsWrapper}>
                {tabOptions.map((option) => (
                    <Button
                        key={option.value}
                        active={activeTab === option.value}
                        onClick={() => handleTabChange(option.value)}
                    >
                        {option.label}
                    </Button>
                ))}
            </div>
            <div className={styles.chartWrapper}>
                {isPingTab ? (
                    <Chart
                        cityLogs={currentData}
                        cities={currentCities}
                        timeRange={timeRange === "3hour" ? "hour" : timeRange}
                        hideLegend
                        {...pingPreset}
                    />
                ) : isBackend ? (
                    <Chart
                        cityLogs={currentData}
                        cities={currentCities}
                        timeRange={timeRange === "3hour" ? "hour" : timeRange}
                        {...backendMetricPreset}
                    />
                ) : (
                    <Chart
                        cityLogs={currentData}
                        cities={currentCities}
                        timeRange={timeRange === "3hour" ? "hour" : timeRange}
                        hideLegend
                        {...httpRequestTimePreset}
                    />
                )}
            </div>
            <div className={styles.avgWrapper}>
                {isBackend ? (
                    <>
                        <span className={styles.avgLabel}>Среднее backend-время</span>
                        <span className={styles.avgValue}>
                            {Object.values(processedBackend.metricAvgs).reduce((a, b) => a + b, 0).toFixed(0)}
                            <small>мс</small>
                        </span>
                    </>
                ) : (
                    <>
                        <span className={styles.avgLabel}>
                            {isLoadTime
                                ? "Среднее время загрузки"
                                : domain
                                    ? "Ping"
                                    : "Средний Ping"
                            }
                        </span>
                        <span className={styles.avgValue}>
                            {currentAvg.toFixed(0)}
                            <small>мс</small>
                        </span>
                    </>
                )}
            </div>
        </div>
    );
};

export default OverviewChart;
