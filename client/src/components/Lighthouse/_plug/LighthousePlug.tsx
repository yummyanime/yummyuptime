import React from "react";
import styles from "./LighthousePlug.module.scss";

const LighthousePlug: React.FC = () => {
    return (
        <div className={styles.lighthouse}>
            <div className={styles.summary}>
                <div className={styles.screenshot}>
                    <div className={styles.strategySwitch}>
                        <div className={styles.switchButton}></div>
                        <div className={styles.switchButton}></div>
                    </div>
                    <div className={styles.shot}></div>
                </div>
                <div className={styles.cards}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={styles.card}>
                            <div className={styles.cardHead}>
                                <div className={styles.cardLabel}></div>
                                <div className={styles.dot}></div>
                            </div>
                            <div className={styles.cardValue}></div>
                        </div>
                    ))}
                </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.container}>
                <div className={styles.tabsWrapper}>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className={styles.tab}></div>
                    ))}
                </div>
                <div className={styles.chartWrapper}></div>
                <div className={styles.avgWrapper}>
                    <div className={styles.avgLabel}></div>
                    <div className={styles.avgValue}></div>
                </div>
            </div>
        </div>
    );
};

export default LighthousePlug;
