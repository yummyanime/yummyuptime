import React from "react";
import styles from "./ChartPlug.module.scss";

const ChartPlug: React.FC = () => {
    return (
        <div className={styles.countryChart}>
            <div className={styles.header}>
                <div className={styles.title}></div>
                <div className={styles.dateRange}></div>
            </div>
            <div className={styles.chartContainer}>
                <div className={styles.chart}></div>
            </div>
            <div className={styles.legend}>
                <div className={styles.legendItem}></div>
                <div className={styles.legendItem}></div>
                <div className={styles.legendItem}></div>
            </div>
        </div>
    );
};

export default ChartPlug;
