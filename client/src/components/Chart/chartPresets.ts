import { cityTranslations } from "../../data/constants.ts";
import type {
    ChartLog,
    ChartProps,
    ChartTooltipCell,
    ChartTooltipContext,
} from "./Chart.tsx";

const msCell = (label: string, value: number | null | undefined, digits = 0): ChartTooltipCell => ({
    label,
    value:
        value === null || value === undefined || !Number.isFinite(Number(value))
            ? "N/A"
            : Number(value).toFixed(digits),
});

export interface HttpLog extends ChartLog {
    total_time?: number;
    status_code?: number;
    download_time?: number;
    first_byte_time?: number;
    dns_time?: number;
    tls_time?: number;
    tcp_time?: number;
    unreliable?: boolean;
    server_timing?: Record<string, number> | null;
}

export interface PingLog extends ChartLog {
    rtt_avg?: number;
    rtt_min?: number;
    rtt_max?: number;
    packet_loss?: number;
    // Some call sites map rtt_avg into total_time for compatibility.
    total_time?: number;
}

type ChartConfig<TLog extends ChartLog> = Pick<
    ChartProps<TLog>,
    "getValue" | "getLabel" | "isUnreliable" | "renderTooltip"
>;

const cityLabel = (series: string) => cityTranslations[series] || series;

const serverTimingLabels: Record<string, string> = {
    db: "БД",
    database: "БД",
    sql: "SQL",
    app: "Приложение",
    php: "PHP",
    template: "Шаблон",
    templates: "Шаблоны",
    render: "Рендер",
    rendering: "Рендер",
    data: "Данные",
    cache: "Кеш",
    redis: "Redis",
    memcached: "Memcached",
    auth: "Авторизация",
    session: "Сессия",
    api: "API",
    bootstrap: "Инициализация",
    init: "Инициализация",
    routing: "Роутинг",
    middleware: "Middleware",
    queue: "Очередь",
    total: "Общее2",
};

const serverTimingLabel = (metric: string) =>
    serverTimingLabels[metric.toLowerCase()] || metric;

export const httpRequestTimePreset: ChartConfig<HttpLog> = {
    getValue: (log) => log.total_time,
    getLabel: cityLabel,
    isUnreliable: (log) => Boolean(log.unreliable),
    renderTooltip: ({ point }: ChartTooltipContext<HttpLog>): ChartTooltipCell[] => {
        const log = point.representative;
        const cells: ChartTooltipCell[] = [
            {
                label: "Статус",
                value: log.status_code !== undefined ? String(log.status_code) : "N/A",
                bold: true,
            },
            msCell("Общее", point.y),
            msCell("DNS", log.dns_time),
            msCell("TCP", log.tcp_time),
            msCell("TLS", log.tls_time),
            msCell("TTFB", log.first_byte_time),
            msCell("Загрузка", log.download_time),
        ];
        if (log.server_timing && typeof log.server_timing === "object") {
            for (const [metric, value] of Object.entries(log.server_timing)) {
                cells.push(msCell(serverTimingLabel(metric), value));
            }
        }
        return cells;
    },
};

export const pingPreset: ChartConfig<PingLog> = {
    getValue: (log) => log.total_time ?? log.rtt_avg,
    getLabel: cityLabel,
    renderTooltip: ({ point }: ChartTooltipContext<PingLog>): ChartTooltipCell[] => {
        const log = point.representative;
        return [
            msCell("Среднее", point.y, 1),
            msCell("Мин", log.rtt_min, 1),
            msCell("Макс", log.rtt_max, 1),
            {
                label: "Потери",
                value:
                    log.packet_loss !== undefined && log.packet_loss !== null
                        ? `${Number(log.packet_loss).toFixed(0)}%`
                        : "N/A",
                bold: true,
            },
        ];
    },
};

export interface BackendMetricPoint extends ChartLog {
    total_time?: number | null;
}

export const backendMetricPreset: ChartConfig<BackendMetricPoint> = {
    getValue: (log) => log.total_time,
    renderTooltip: ({ point }: ChartTooltipContext<BackendMetricPoint>): ChartTooltipCell[] => [
        msCell("Значение", point.y),
    ],
};
