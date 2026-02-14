import { useState, useEffect } from "react";
import { domains } from "../../data/constants.ts";
import DomainStatus from "../DomainStatus/DomainStatus.tsx";
import StatusPlug from "./StatusPlug.tsx";
import styles from "./Status.module.scss";

interface Log {
    created_at: string;
    domain?: string;
    country?: string;
    city?: string;
    status_code?: number;
    total_time?: number;
}

interface GroupedLog {
    created_at: string;
    total_time_avg: number;
    results: {
        city: string;
        country: string;
        status_code: number | null;
        total_time: number | null;
    }[];
}

interface DomainLogs {
    [domain: string]: GroupedLog[];
}

interface StatusProps {
    domain?: string;
    allLogs: Log[];
    loading: boolean;
    timeRange?: string;
}

const Status: React.FC<StatusProps> = ({ domain, allLogs, loading, timeRange }) => {
    const [domainLogs, setDomainLogs] = useState<DomainLogs>({});

    useEffect(() => {
        if (allLogs.length === 0) return;

        const groupedByDomain = allLogs.reduce(
            (acc, log) => {
                const currentDomain = domain || log.domain || "unknown";
                if (!acc[currentDomain]) {
                    acc[currentDomain] = [];
                }
                acc[currentDomain].push(log);
                return acc;
            },
            {} as Record<string, Log[]>
        );

        const processedDomainLogs: DomainLogs = {};

        for (const domainName in groupedByDomain) {
            const logsForDomain = groupedByDomain[domainName];
            const groupedByTime = logsForDomain.reduce(
                (acc, log) => {
                    const time = log.created_at.substring(0, 16);
                    if (!acc[time]) {
                        acc[time] = [];
                    }
                    acc[time].push(log);
                    return acc;
                },
                {} as Record<string, Log[]>
            );

            processedDomainLogs[domainName] = Object.entries(groupedByTime)
                .map(([_, logs]) => {
                    const total_time_avg =
                        logs.reduce(
                            (sum, log) => sum + (log.total_time || 0),
                            0
                        ) / logs.length;
                    return {
                        created_at: logs[0].created_at,
                        total_time_avg,
                        results: logs.map(
                            ({
                                city = "Unknown",
                                country = "Unknown",
                                status_code = null,
                                total_time = null,
                            }) => ({
                                city: city || "Unknown",
                                country: country || "Unknown",
                                status_code,
                                total_time,
                            })
                        ),
                    };
                })
                .sort(
                    (b, a) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime()
                );
        }

        setDomainLogs(processedDomainLogs);
    }, [allLogs, domain]);

    if (loading) return <StatusPlug domain={domain} />;

    return (
        <div>
            <div className={styles.statusContainer}>
                {domains.map(
                    (d) =>
                        (!domain || domain === d) && (
                            <DomainStatus
                                key={d}
                                domain={d}
                                logs={domainLogs[d] || []}
                                timeRange={timeRange}
                            />
                        )
                )}
            </div>
        </div>
    );
};

export default Status;