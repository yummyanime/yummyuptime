import React from "react";
import Button from "../../Button/Button.tsx";
import styles from "./OverviewPlug.module.scss";

const OverviewPlug: React.FC = () => {
    return (
        <div className={styles.overviewContainer}>
            <div className={styles.leftPart}>
                <div className={styles.statusBadge}></div>
                <div className={styles.domainList}>
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className={styles.domainItem}>
                            <div className={styles.statusCircle}></div>
                            <div className={styles.domainLabel}></div>
                        </div>
                    ))}
                </div>
            </div>
            <div className={styles.rightPart}>
                <div className={styles.tabsWrapper}>
                    <Button active>Время загрузки</Button>
                    <Button>Ping</Button>
                </div>
                <div className={styles.chartWrapper}></div>
                <div className={styles.avgWrapper}>
                    <span className={styles.avgLabel}>Среднее время загрузки</span>
                    <div className={styles.avgValue}></div>
                </div>
            </div>
        </div>
    );
};

export default OverviewPlug;
