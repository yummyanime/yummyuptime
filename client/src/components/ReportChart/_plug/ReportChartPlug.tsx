import React from "react";
import styles from "./ReportChartPlug.module.scss";

const ReportChartPlug: React.FC = () => {
    return (
        <div className={styles.grid}>
            <div className={styles.chartCard}>
                <div className={styles.chartHeader}>
                    <span className={styles.chartLabel}>
                        График жалоб за 24 часа
                    </span>
                </div>
                <div className={styles.chartWrapper}></div>
            </div>
            <div className={styles.reasonsCard}>
                <span className={styles.reasonsTitle}>Популярные причины</span>
                <div className={styles.reasonsList}>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className={styles.reasonItem}></div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ReportChartPlug;
