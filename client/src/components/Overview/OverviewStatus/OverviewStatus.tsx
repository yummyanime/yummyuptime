import React from "react";
import styles from "./OverviewStatus.module.scss";
import { domains as domainOrder } from "../../../data/constants.ts";

interface Log {
    created_at: string;
    domain?: string;
    status_code?: number;
    total_time?: number;
}

interface OverviewStatusProps {
    allLogs: Log[];
}

interface DomainStatus {
    domain: string;
    statusText: string;
    statusClass: string;
}

const OverviewStatus: React.FC<OverviewStatusProps> = ({ allLogs }) => {
    const analyzeLogs = (logs: Log[]) => {
        if (logs.length === 0) return "Все работает стабильно";

        const ignoredCodes = [202, 599, 429];

        const relevantLogs = logs.filter(
            (log) => log.status_code !== undefined && !ignoredCodes.includes(log.status_code)
        );

        if (relevantLogs.length === 0) return "Все работает стабильно";

        const errorLogs = relevantLogs.filter(
            (log) => log.status_code !== 200 || (log.total_time && log.total_time > 1500)
        );

        const errorRate = (errorLogs.length / relevantLogs.length) * 100;

        const sortedLogs = [...relevantLogs].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        const lastLogs = sortedLogs.slice(-4);
        const last4Errors = lastLogs.length >= 4 && lastLogs.every(log => log.status_code !== 200 || (log.total_time && log.total_time > 1500));
        const last2Errors = lastLogs.length >= 2 && lastLogs.slice(-2).every(log => log.status_code !== 200 || (log.total_time && log.total_time > 1500));

        if (errorRate >= 20 || last4Errors) {
            return "Возникли неполадки";
        }

        if (errorRate >= 5 || last2Errors) {
            return "Возможные неполадки";
        }

        return "Все работает стабильно";
    };

    const uniqueDomains = Array.from(new Set(allLogs.map(log => log.domain).filter(Boolean))) as string[];
    const domains = uniqueDomains.sort((a, b) => {
        const indexA = domainOrder.indexOf(a);
        const indexB = domainOrder.indexOf(b);
        return (indexA === -1 ? Infinity : indexA) - (indexB === -1 ? Infinity : indexB);
    });

    const domainStatuses: DomainStatus[] = domains.map(domain => {
        const domainLogs = allLogs.filter(log => log.domain === domain);
        const statusText = analyzeLogs(domainLogs);

        let statusClass = styles.stable;

        if (statusText === "Возникли неполадки") {
            statusClass = styles.critical;
        } else if (statusText === "Возможные неполадки") {
            statusClass = styles.warning;
        }

        return { domain, statusText, statusClass };
    });

    // Определение общего статуса (худшего из всех доменов)
    let globalStatusText = "Все работает стабильно";
    let globalStatusClass = styles.stable;

    if (domainStatuses.some(s => s.statusText === "Возникли неполадки")) {
        globalStatusText = "Возникли неполадки";
        globalStatusClass = styles.critical;
    } else if (domainStatuses.some(s => s.statusText === "Возможные неполадки")) {
        globalStatusText = "Возможные неполадки";
        globalStatusClass = styles.warning;
    }

    if (allLogs.length === 0) {
        return (
            <div className={styles.container}>
                <div className={`${styles.statusBadge} ${styles.stable}`}>
                    Все работает стабильно
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={`${styles.statusBadge} ${globalStatusClass}`}>
                {globalStatusText}
            </div>

            <div className={styles.domainList}>
                {domainStatuses.map((status, index) => (
                    <div
                        key={index}
                        className={`${styles.domainItem} ${status.statusClass}`}
                        title={status.statusText}
                    >
                        <div className={styles.statusCircle} />
                        <span>{status.domain}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default OverviewStatus;
