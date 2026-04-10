import React from "react";
import OverviewStatus from "./OverviewStatus/OverviewStatus.tsx";
import OverviewChart from "./OverviewChart/OverviewChart.tsx";
import styles from "./Overview.module.scss";
import OverviewPlug from "./OverviewPlug.tsx";

interface Log {
    created_at: string;
    domain?: string;
    status_code?: number;
    total_time?: number;
}

interface PingLog {
    created_at: string;
    domain?: string;
    rtt_avg?: number;
    rtt_min?: number;
    rtt_max?: number;
    packet_loss?: number;
}

interface OverviewProps {
    allLogs: Log[];
    pingLogs: PingLog[];
    loading: boolean;
    timeRange: string;
    domain?: string;
}

const Overview: React.FC<OverviewProps> = ({ allLogs, pingLogs, loading, timeRange, domain }) => {
    if (loading) return <OverviewPlug />;

    return (
        <div className={styles.overviewContainer}>
            <div className={styles.leftPart}>
                <OverviewStatus allLogs={allLogs} />
            </div>
            <div className={styles.rightPart}>
                <OverviewChart allLogs={allLogs} pingLogs={pingLogs} timeRange={timeRange} domain={domain} />
            </div>
        </div>
    );
};

export default Overview;
