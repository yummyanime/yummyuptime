import React, { useMemo } from "react";
import Button from "../../../Button/Button.tsx";
import {
    getMetric,
    rate,
    RATING_COLORS,
    formatMetric,
    type LighthouseLog,
    type LighthouseMetricKey,
} from "../../lighthouseMetrics.ts";
import styles from "./LhSummary.module.scss";

export interface ScreenshotData {
    image: string | null;
    url_path?: string;
    updated_at?: string;
}

interface LhSummaryProps {
    logs: LighthouseLog[];
    strategy: string;
    onStrategyChange: (strategy: "mobile" | "desktop") => void;
    screenshot: ScreenshotData | null;
}

// Порядок карточек совпадает с порядком кнопок графика.
const SUMMARY_KEYS: LighthouseMetricKey[] = [
    "lcp",
    "ttfb",
    "cls",
    "tbt",
    "fcp",
    "perf_score",
];

const avgOf = (
    logs: LighthouseLog[],
    key: keyof LighthouseLog
): number | null => {
    let sum = 0;
    let count = 0;
    for (const log of logs) {
        const v = log[key] as number | null | undefined;
        if (v !== null && v !== undefined && Number.isFinite(v)) {
            sum += v;
            count += 1;
        }
    }
    return count > 0 ? sum / count : null;
};

const latestOf = (
    logs: LighthouseLog[],
    key: keyof LighthouseLog
): number | null => {
    for (let i = logs.length - 1; i >= 0; i--) {
        const v = logs[i][key] as number | null | undefined;
        if (v !== null && v !== undefined && Number.isFinite(v)) return v;
    }
    return null;
};

const LhSummary: React.FC<LhSummaryProps> = ({
    logs,
    strategy,
    onStrategyChange,
    screenshot,
}) => {
    const cards = useMemo(
        () =>
            SUMMARY_KEYS.map((key) => {
                const metric = getMetric(key);
                const avg = avgOf(logs, metric.key);
                const p75 = metric.fieldKey ? latestOf(logs, metric.fieldKey) : null;
                return {
                    metric,
                    avg,
                    p75,
                    rating: rate(metric, avg),
                    p75Rating: rate(metric, p75),
                    hasField: Boolean(metric.fieldKey),
                };
            }),
        [logs]
    );

    const updatedLabel = screenshot?.updated_at
        ? new Date(screenshot.updated_at).toLocaleString("ru-RU", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
          })
        : null;

    return (
        <div className={styles.summary}>
            <div className={styles.screenshot}>
                <div className={styles.strategySwitch}>
                    <Button
                        active={strategy === "desktop"}
                        onClick={() => onStrategyChange("desktop")}
                    >
                        ПК
                    </Button>
                    <Button
                        active={strategy === "mobile"}
                        onClick={() => onStrategyChange("mobile")}
                    >
                        Телефон
                    </Button>
                </div>
                {screenshot?.image ? (
                    <>
                        <img src={screenshot.image} alt="Скриншот страницы" />
                        <span className={styles.shotMeta}>
                            {strategy === "desktop" ? "ПК" : "Телефон"}
                            {updatedLabel ? ` · ${updatedLabel}` : ""}
                        </span>
                    </>
                ) : (
                    <div className={styles.shotPlaceholder}>Скриншот пока не получен</div>
                )}
            </div>

            <div className={styles.cards}>
                {cards.map(({ metric, avg, p75, rating, p75Rating, hasField }) => (
                    <div key={metric.key} className={styles.card}>
                        <div className={styles.cardHead}>
                            <span className={styles.cardLabel}>{metric.label}</span>
                            <span
                                className={styles.dot}
                                style={{ backgroundColor: RATING_COLORS[rating] }}
                            />
                        </div>
                        <span
                            className={styles.cardValue}
                            style={{ color: RATING_COLORS[rating] }}
                        >
                            {formatMetric(metric, avg)}
                        </span>
                        {hasField ? (
                            <>
                                <div className={styles.cardDivider} />
                                <div className={styles.p75Row}>
                                    <span className={styles.p75Label}>p75</span>
                                    <span
                                        className={styles.p75Value}
                                        style={{ color: RATING_COLORS[p75Rating] }}
                                    >
                                        {formatMetric(metric, p75)}
                                    </span>
                                </div>
                            </>
                        ) : null}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LhSummary;
