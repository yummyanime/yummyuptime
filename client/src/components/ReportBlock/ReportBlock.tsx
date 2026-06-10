import React, { useState } from "react";
import Button from "../Button/Button.tsx";
import { REASONS, type ReasonCode } from "../../data/outage.ts";
import styles from "./ReportBlock.module.scss";

interface ReportBlockProps {
    onReported?: () => void;
}

const ReportBlock: React.FC<ReportBlockProps> = ({ onReported }) => {
    const [selected, setSelected] = useState<ReasonCode[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [justReported, setJustReported] = useState(false);

    const toggleReason = (code: ReasonCode) => {
        setSelected((prev) =>
            prev.includes(code)
                ? prev.filter((c) => c !== code)
                : [...prev, code]
        );
        setJustReported(false);
    };

    const handleSubmit = async () => {
        if (selected.length === 0 || submitting) return;
        setSubmitting(true);
        try {
            const res = await fetch("/outage-reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reasons: selected }),
            });
            if (res.ok) {
                setSelected([]);
                setJustReported(true);
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
                        onClick={() => toggleReason(r.code)}
                    >
                        {r.label}
                    </Button>
                ))}
            </div>

            <button
                type="button"
                className={styles.submitButton}
                disabled={selected.length === 0 || submitting}
                onClick={handleSubmit}
            >
                {submitting ? "Отправляем…" : "Сообщить о сбое"}
            </button>

            {justReported && (
                <div className={styles.thanks}>
                    Спасибо! Ваше сообщение учтено.
                </div>
            )}
        </div>
    );
};

export default ReportBlock;
