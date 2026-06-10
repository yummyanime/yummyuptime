import React, { useEffect, useState } from "react";
import Button from "../Button/Button.tsx";
import { REASONS, type ReasonCode } from "../../data/outage.ts";
import styles from "./ReportBlock.module.scss";

interface ReportBlockProps {
    onReported?: () => void;
}

const REPORT_STORAGE_KEY = "outageReportedAt";
const REPORT_COOLDOWN_MS = 60 * 60 * 1000;

const hasRecentlyReported = () => {
    const raw = localStorage.getItem(REPORT_STORAGE_KEY);
    if (!raw) return false;
    const reportedAt = Number(raw);
    return Number.isFinite(reportedAt) && Date.now() - reportedAt < REPORT_COOLDOWN_MS;
};

const ReportBlock: React.FC<ReportBlockProps> = ({ onReported }) => {
    const [selected, setSelected] = useState<ReasonCode[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [reported, setReported] = useState(hasRecentlyReported);

    useEffect(() => {
        if (!reported) return;
        const raw = localStorage.getItem(REPORT_STORAGE_KEY);
        const reportedAt = Number(raw);
        if (!Number.isFinite(reportedAt)) return;
        const remaining = REPORT_COOLDOWN_MS - (Date.now() - reportedAt);
        if (remaining <= 0) {
            setReported(false);
            return;
        }
        const timer = setTimeout(() => setReported(false), remaining);
        return () => clearTimeout(timer);
    }, [reported]);

    const toggleReason = (code: ReasonCode) => {
        setSelected((prev) =>
            prev.includes(code)
                ? prev.filter((c) => c !== code)
                : [...prev, code]
        );
    };

    const handleSubmit = async () => {
        if (selected.length === 0 || submitting || reported) return;
        setSubmitting(true);
        try {
            const res = await fetch("/outage-reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reasons: selected }),
            });
            if (res.ok) {
                localStorage.setItem(REPORT_STORAGE_KEY, String(Date.now()));
                setSelected([]);
                setReported(true);
                onReported?.();
            }
        } catch (e) {
            console.error("Error sending outage report:", e);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={styles.block}>
            <div className={styles.reasonButtons}>
                {REASONS.map((r) => (
                    <Button
                        key={r.code}
                        active={selected.includes(r.code)}
                        disabled={reported}
                        onClick={() => toggleReason(r.code)}
                    >
                        {r.label}
                    </Button>
                ))}
            </div>

            <button
                type="button"
                className={`${styles.submitButton} ${reported ? styles.reported : ""}`}
                disabled={(selected.length === 0 && !reported) || submitting || reported}
                onClick={handleSubmit}
            >
                {reported
                    ? "Сообщено о сбое"
                    : submitting
                      ? "Отправляем…"
                      : "Сообщить о сбое"}
            </button>
        </div>
    );
};

export default ReportBlock;
