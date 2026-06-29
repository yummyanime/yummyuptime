import React from "react";
import { NavLink } from "react-router-dom";
import Button from "../../Button/Button.tsx";
import { getDomainLabel } from "../../../data/constants.ts";
import styles from "./ChartPlug.module.scss";

interface ChartPlugProps {
    domainName?: string;
}

const ChartPlug: React.FC<ChartPlugProps> = ({ domainName }) => {
    return (
        <div className={styles.countryChart}>
            <div className={styles.header}>
                {domainName ? (
                    <>
                        <p className={styles.itemName}>
                            {getDomainLabel(domainName)}
                        </p>
                        <NavLink to={`${domainName}`}>
                            <Button>Подробнее</Button>
                        </NavLink>
                    </>
                ) : (
                    <>
                        <div className={styles.title}></div>
                        <div className={styles.dateRange}></div>
                    </>
                )}
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
