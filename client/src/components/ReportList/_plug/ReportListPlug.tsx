import React from "react";
import styles from "./ReportListPlug.module.scss";

const ReportListPlug: React.FC = () => {
    return (
        <div className={styles.card}>
            <span className={styles.title}>Последние жалобы за 24 часа</span>
            <div className={styles.list}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={styles.item}></div>
                ))}
            </div>
        </div>
    );
};

export default ReportListPlug;
