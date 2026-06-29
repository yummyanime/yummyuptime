import React from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { REASON_LABELS, type OutageData } from "../../data/outage.ts";
import ReportListPlug from "./_plug/ReportListPlug.tsx";
import styles from "./ReportList.module.scss";

interface ReportListProps {
    data: OutageData | null;
    loading: boolean;
}

const ReportList: React.FC<ReportListProps> = ({ data, loading }) => {
    if (loading) return <ReportListPlug />;

    const reports = data?.reports ?? [];

    return (
        <div className={styles.card}>
            <span className={styles.title}>Последние жалобы за 24 часа</span>
            {reports.length === 0 ? (
                <div className={styles.empty}>
                    За последние 24 часа жалоб не поступало
                </div>
            ) : (
                <ul className={styles.list}>
                    {reports.map((report) => (
                        <li key={report.time} className={styles.item}>
                            <span className={styles.date}>
                                {format(new Date(report.time), "d MMM, HH:mm", {
                                    locale: ru,
                                })}
                            </span>
                            <div className={styles.reasons}>
                                {report.reasons.map((reason, i) => (
                                    <span key={i} className={styles.reason}>
                                        {REASON_LABELS[reason] ?? reason}
                                    </span>
                                ))}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default ReportList;
