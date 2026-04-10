import React, { useMemo, useState } from "react";
import CountryChart from "../../CountryChart/CountryChart.tsx";
import styles from "./OverviewChart.module.scss";

interface Log {
    created_at: string;
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

const OverviewChart: React.FC<OverviewChartProps> = ({ allLogs, pingLogs, timeRange, domain }) => {
    const [activeTab, setActiveTab] = useState<"loadTime" | "ping">("loadTime");

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

    const isLoadTime = activeTab === "loadTime";
    const currentData = isLoadTime ? processedLoadTime.cityLogs : processedPing.cityLogs;
    const currentAvg = isLoadTime ? processedLoadTime.avgTotal : processedPing.avgPing;
    const currentCities = isLoadTime ? ["Средняя"] : Object.keys(processedPing.cityLogs);

    return (
        <div className={styles.container}>
            <div className={styles.tabsWrapper}>
                <button
                    className={`${styles.tab} ${activeTab === "loadTime" ? styles.tabActive : ""}`}
                    onClick={() => setActiveTab("loadTime")}
                >
                    Время загрузки
                </button>
                <button
                    className={`${styles.tab} ${activeTab === "ping" ? styles.tabActive : ""}`}
                    onClick={() => setActiveTab("ping")}
                >
                    Ping
                </button>
            </div>
            <div className={styles.chartWrapper}>
                <CountryChart
                    cityLogs={currentData}
                    cities={currentCities}
                    timeRange={timeRange === "3hour" ? "hour" : timeRange}
                    isChartLoading={false}
                    hideLegend={true}
                />
            </div>
            <div className={styles.avgWrapper}>
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
            </div>
        </div>
    );
};

export default OverviewChart;
