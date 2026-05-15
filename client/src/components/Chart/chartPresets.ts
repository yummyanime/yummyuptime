import { cityTranslations } from "../../data/constants.ts";
import type {
    ChartLog,
    ChartProps,
    ChartTooltipContext,
} from "./Chart.tsx";

export interface HttpLog extends ChartLog {
    total_time?: number;
    status_code?: number;
    download_time?: number;
    first_byte_time?: number;
    dns_time?: number;
    tls_time?: number;
    tcp_time?: number;
    unreliable?: boolean;
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

export const httpRequestTimePreset: ChartConfig<HttpLog> = {
    getValue: (log) => log.total_time,
    getLabel: cityLabel,
    isUnreliable: (log) => Boolean(log.unreliable),
    renderTooltip: ({ label, point }: ChartTooltipContext<HttpLog>) => {
        const log = point.representative;
        return [
            label,
            `Общее время: ${point.y !== null ? point.y.toFixed(0) : "N/A"}мс`,
            ...(log.unreliable ? ["Недостоверный запрос"] : []),
            `Статус: ${log.status_code}`,
            `DNS: ${log.dns_time}мс`,
            `TCP: ${log.tcp_time}мс`,
            `TLS: ${log.tls_time}мс`,
            `Первый байт: ${log.first_byte_time}мс`,
            `Загрузка: ${log.download_time}мс`,
        ];
    },
};

export const pingPreset: ChartConfig<PingLog> = {
    getValue: (log) => log.total_time ?? log.rtt_avg,
    getLabel: cityLabel,
    renderTooltip: ({ label, point }: ChartTooltipContext<PingLog>) => {
        const log = point.representative;
        return [
            label,
            `Среднее: ${point.y !== null ? point.y.toFixed(1) : "N/A"}мс`,
            `Мин: ${log.rtt_min !== undefined ? Number(log.rtt_min).toFixed(1) : "N/A"}мс`,
            `Макс: ${log.rtt_max !== undefined ? Number(log.rtt_max).toFixed(1) : "N/A"}мс`,
            `Потери: ${log.packet_loss !== undefined ? Number(log.packet_loss).toFixed(0) : "N/A"}%`,
        ];
    },
};

export interface BackendMetricPoint extends ChartLog {
    total_time?: number | null;
}

export const backendMetricPreset: ChartConfig<BackendMetricPoint> = {
    getValue: (log) => log.total_time,
    renderTooltip: ({
        label,
        point,
    }: ChartTooltipContext<BackendMetricPoint>) => [
        label,
        `${point.y !== null ? point.y.toFixed(0) : "N/A"}мс`,
    ],
};
