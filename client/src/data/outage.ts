export const REASONS = [
    { code: "not_loading", label: "Не загружается сайт" },
    { code: "slow", label: "Долгая загрузка" },
    { code: "no_media", label: "Нет изображений и видео" },
    { code: "freezing", label: "Зависает" },
    { code: "auth", label: "Не работает регистрация/авторизация" },
] as const;

export type ReasonCode = (typeof REASONS)[number]["code"];

export const REASON_LABELS: Record<string, string> = Object.fromEntries(
    REASONS.map((r) => [r.code, r.label])
);

export interface OutageBucket {
    time: string;
    count: number;
}

export interface OutageReasonCount {
    reason: string;
    count: number;
}

export interface OutageReport {
    time: string;
    reasons: string[];
}

export interface OutageData {
    updatedAt: string;
    total: number;
    buckets: OutageBucket[];
    reasons: OutageReasonCount[];
    reports: OutageReport[];
}
