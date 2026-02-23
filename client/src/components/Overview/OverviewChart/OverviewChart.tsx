import React, { useMemo } from "react";
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

interface OverviewChartProps {
    allLogs: Log[];
    timeRange: string;
}

const OverviewChart: React.FC<OverviewChartProps> = ({ allLogs, timeRange }) => {
    // Подготавливаем данные для CountryChart
    const processedData = useMemo(() => {
        if (!allLogs || allLogs.length === 0) return { cityLogs: {} as Record<string, Log[]>, avgTotal: 0 };

        // Фильтруем логи, у которых есть total_time
        const validLogs = allLogs.filter(log => log.total_time !== undefined);
        
        if (validLogs.length === 0) return { cityLogs: {} as Record<string, Log[]>, avgTotal: 0 };

        const avgTotal = validLogs.reduce((acc, log) => acc + (log.total_time || 0), 0) / validLogs.length;

        // Для CountryChart передаем в формате { "Средняя": [logs] }
        const cityLogs: Record<string, Log[]> = {
            ["Средняя"]: validLogs
        };

        return {
            cityLogs,
            avgTotal
        };
    }, [allLogs]);

    return (
        <div className={styles.container}>
            <div className={styles.chartWrapper}>
                <CountryChart 
                    cityLogs={processedData.cityLogs} 
                    cities={[ "Средняя" ]} 
                    timeRange={timeRange === "3hour" ? "hour" : timeRange}
                    isChartLoading={false} 
                    hideLegend={true}
                />
            </div>
            <div className={styles.avgWrapper}>
                <span className={styles.avgLabel}>Среднее время загрузки</span>
                <span className={styles.avgValue}>
                    {processedData.avgTotal.toFixed(0)}
                    <small>мс</small>
                </span>
            </div>
        </div>
    );
};

export default OverviewChart;
