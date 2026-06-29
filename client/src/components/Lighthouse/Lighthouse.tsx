import React, { useEffect, useState, useCallback } from "react";
import LhSummary, { type ScreenshotData } from "./_content/LhSummary/LhSummary.tsx";
import LhChart from "./_content/LhChart/LhChart.tsx";
import LighthousePlug from "./_plug/LighthousePlug.tsx";
import { useDashboardSettings } from "../../context/DashboardSettingsContext.tsx";
import type { LighthouseLog } from "./lighthouseMetrics.ts";
import styles from "./Lighthouse.module.scss";

interface LighthouseProps {
    domain: string;
}

type Strategy = "mobile" | "desktop";

const Lighthouse: React.FC<LighthouseProps> = ({ domain }) => {
    const { timeRange, dateRange, effectiveTimeRange } = useDashboardSettings();
    const [strategy, setStrategy] = useState<Strategy>(
        () => (localStorage.getItem("lighthouseStrategy") as Strategy) || "mobile"
    );
    const [logs, setLogs] = useState<LighthouseLog[]>([]);
    const [screenshot, setScreenshot] = useState<ScreenshotData | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasData, setHasData] = useState(false);

    const handleStrategy = (value: Strategy) => {
        setStrategy(value);
        localStorage.setItem("lighthouseStrategy", value);
    };

    const buildQuery = useCallback(() => {
        const params = new URLSearchParams();
        if (dateRange) {
            params.set("dateFrom", dateRange.from);
            params.set("dateTo", dateRange.to);
        } else {
            params.set("timeRange", timeRange);
        }
        params.set("domain", domain);
        params.set("strategy", strategy);
        return params.toString();
    }, [dateRange, timeRange, domain, strategy]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        const fetchAll = async () => {
            try {
                const [logsRes, shotRes] = await Promise.all([
                    fetch(`/lighthouse-logs?${buildQuery()}`),
                    fetch(
                        `/lighthouse-screenshot?domain=${encodeURIComponent(
                            domain
                        )}&strategy=${strategy}`
                    ),
                ]);

                if (!cancelled && logsRes.ok) {
                    const data: LighthouseLog[] = await logsRes.json();
                    setLogs(data);
                    if (data.length > 0) setHasData(true);
                }
                if (!cancelled && shotRes.ok) {
                    const shot = await shotRes.json();
                    setScreenshot(shot);
                }
            } catch (e) {
                console.error("Error fetching Lighthouse data:", e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchAll();
        return () => {
            cancelled = true;
        };
    }, [buildQuery, domain, strategy]);

    if (loading) {
        return <LighthousePlug />;
    }

    if (!hasData && logs.length === 0) {
        return null;
    }

    return (
        <div className={styles.lighthouse}>
            <LhSummary
                logs={logs}
                strategy={strategy}
                onStrategyChange={handleStrategy}
                screenshot={screenshot}
            />

            <div className={styles.divider} />

            <LhChart logs={logs} timeRange={effectiveTimeRange} />
        </div>
    );
};

export default Lighthouse;
