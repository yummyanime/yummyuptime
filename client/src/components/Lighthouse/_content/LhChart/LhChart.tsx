import React, { useMemo, useState } from "react";
import Chart from "../../../Chart/Chart.tsx";
import Button from "../../../Button/Button.tsx";
import {
    makeLighthousePreset,
    type LighthousePoint,
} from "../../../Chart/chartPresets.ts";
import {
    LIGHTHOUSE_METRICS,
    getMetric,
    rate,
    RATING_COLORS,
    formatMetric,
    metricUnitLabel,
    type LighthouseLog,
    type LighthouseMetricKey,
} from "../../lighthouseMetrics.ts";
import styles from "./LhChart.module.scss";

interface LhChartProps {
    logs: LighthouseLog[];
    timeRange: string;
}

const LAB_SERIES = "Uptime сервис";
const FIELD_SERIES = "Google";

const LhChart: React.FC<LhChartProps> = ({ logs, timeRange }) => {
    const [activeMetric, setActiveMetric] = useState<LighthouseMetricKey>(
        () =>
            (localStorage.getItem("lighthouseMetric") as LighthouseMetricKey) ||
            "lcp"
    );

    const handleMetricChange = (key: LighthouseMetricKey) => {
        setActiveMetric(key);
        localStorage.setItem("lighthouseMetric", key);
    };

    const metric = getMetric(activeMetric);
    const digits = metric.unit === "unitless" ? 2 : 0;

    const { cityLogs, cities, avg } = useMemo(() => {
        const labPoints: LighthousePoint[] = [];
        const fieldPoints: LighthousePoint[] = [];
        let sum = 0;
        let count = 0;

        for (const log of logs) {
            const labVal = log[metric.key] as number | null | undefined;
            labPoints.push({ created_at: log.created_at, value: labVal });
            if (labVal !== null && labVal !== undefined && Number.isFinite(labVal)) {
                sum += labVal;
                count += 1;
            }
            if (metric.fieldKey) {
                const fieldVal = log[metric.fieldKey] as number | null | undefined;
                fieldPoints.push({ created_at: log.created_at, value: fieldVal });
            }
        }

        const hasField = fieldPoints.some(
            (p) => p.value !== null && p.value !== undefined && Number.isFinite(p.value as number)
        );

        const cityLogs: Record<string, LighthousePoint[]> = {
            [LAB_SERIES]: labPoints,
        };
        const cities = [LAB_SERIES];
        if (metric.fieldKey && hasField) {
            cityLogs[FIELD_SERIES] = fieldPoints;
            cities.push(FIELD_SERIES);
        }

        return { cityLogs, cities, avg: count > 0 ? sum / count : null };
    }, [logs, metric.key, metric.fieldKey]);

    const preset = useMemo(() => makeLighthousePreset(digits, metric.label), [digits, metric.label]);

    const avgRating = rate(metric, avg);
    const unit = metricUnitLabel(metric);

    return (
        <div className={styles.container}>
            <div className={styles.tabsWrapper}>
                {LIGHTHOUSE_METRICS.map((m) => (
                    <Button
                        key={m.key}
                        active={activeMetric === m.key}
                        onClick={() => handleMetricChange(m.key)}
                    >
                        {m.label}
                    </Button>
                ))}
            </div>
            <div className={styles.chartWrapper}>
                <Chart
                    cityLogs={cityLogs}
                    cities={cities}
                    timeRange={timeRange}
                    hideLegend={cities.length < 2}
                    {...preset}
                />
            </div>
            <div className={styles.avgWrapper}>
                <span className={styles.avgLabel}>Среднее {metric.label}</span>

                <span
                    className={styles.avgValue}
                    style={{ color: RATING_COLORS[avgRating] }}
                >
                    {formatMetric(metric, avg)}
                    {avg !== null && metric.unit === "unitless" && unit ? (
                        <small>{unit}</small>
                    ) : null}
                </span>
            </div>
        </div>
    );
};

export default LhChart;
