import { Line } from "react-chartjs-2";
import { useRef, useEffect, useState, useId } from "react";
import styles from "./Chart.module.scss";
import {
    Chart as ChartJS,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    TimeScale,
    TimeSeriesScale,
} from "chart.js";
import "chartjs-adapter-date-fns";
import { ru } from "date-fns/locale";
import CrosshairPlugin from "chartjs-plugin-crosshair";
import { CHART_COLORS } from "../../data/constants.ts";

const crosshairInitPatch = {
    id: "crosshairInitPatch",
    beforeInit(chart: ChartJS) {
        (chart as any).crosshair = { enabled: false };
    },
};

ChartJS.register(
    crosshairInitPatch,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    CrosshairPlugin,
    TimeScale,
    TimeSeriesScale
);

export interface ChartLog {
    created_at: string;
}

export interface ChartPoint<TLog extends ChartLog> {
    x: number;
    y: number | null;
    logs: TLog[];
    representative: TLog;
}

export interface ChartTooltipContext<TLog extends ChartLog> {
    series: string;
    label: string;
    point: ChartPoint<TLog>;
}

export interface ChartTooltipCell {
    label: string;
    value: string;
    bold?: boolean;
}

export interface ChartProps<TLog extends ChartLog> {
    cityLogs: Record<string, TLog[]>;
    cities: string[];
    timeRange: string;
    isChartLoading: boolean;
    hideLegend?: boolean;
    getValue: (log: TLog) => number | null | undefined;
    getLabel?: (series: string) => string;
    isUnreliable?: (representative: TLog) => boolean;
    renderTooltip: (ctx: ChartTooltipContext<TLog>) => ChartTooltipCell[];
}

const escapeHtml = (s: string) =>
    s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");


function Chart<TLog extends ChartLog>({
    cityLogs,
    cities,
    timeRange,
    isChartLoading,
    hideLegend = false,
    getValue,
    getLabel,
    isUnreliable,
    renderTooltip,
}: ChartProps<TLog>) {
    const [width, setWidth] = useState(window.innerWidth);

    useEffect(() => {
        const handleResize = () => setWidth(window.innerWidth);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const chartRef = useRef<ChartJS<"line", ChartPoint<TLog>[]>>(null);
    const isPinnedRef = useRef(false);
    const reactId = useId();
    const tooltipIdRef = useRef(`chartjs-tooltip-${reactId}`);
    const isMobile = width <= 500;

    useEffect(() => {
        const chart = chartRef.current;
        if (chart) {
            if (isChartLoading) {
                chart.canvas.classList.add(styles.chartLoading);
            } else {
                chart.canvas.classList.remove(styles.chartLoading);
            }
            chart.canvas.setAttribute("data-chart-canvas", "");
        }
    }, [isChartLoading]);

    useEffect(() => {
        const canvas = chartRef.current?.canvas;
        if (!canvas) return;
        const handler = () => {
            isPinnedRef.current = false;
        };
        canvas.addEventListener("pointerdown", handler);
        return () => {
            canvas.removeEventListener("pointerdown", handler);
        };
    }, []);

    useEffect(() => {
        const id = tooltipIdRef.current;
        return () => {
            const tooltipEl = document.getElementById(id);
            if (tooltipEl) {
                tooltipEl.remove();
            }
        };
    }, []);

    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
            if (!isPinnedRef.current) return;
            const target = e.target as Element | null;
            if (!target) return;
            // Click on any chart canvas or any chart tooltip → не закрываем,
            // чтобы другие графики могли работать параллельно с этим запиненным.
            if (target.closest?.("[data-chart-canvas]")) return;
            if (target.closest?.('[id^="chartjs-tooltip-"]')) return;
            isPinnedRef.current = false;
            const tooltipEl = document.getElementById(tooltipIdRef.current);
            if (tooltipEl) {
                tooltipEl.style.opacity = "0";
                tooltipEl.style.visibility = "hidden";
                tooltipEl.style.pointerEvents = "none";
            }
        };
        document.addEventListener("mousedown", handleOutsideClick);
        document.addEventListener("touchstart", handleOutsideClick);
        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
            document.removeEventListener("touchstart", handleOutsideClick);
        };
    }, []);

    const datasets = cities.map((city, index) => {
        const logs = cityLogs[city] || [];
        const colorIndex = index % CHART_COLORS.length;
        const color = CHART_COLORS[colorIndex] || "#c9cbcf";

        const groupedLogs = logs.reduce(
            (acc: { [key: number]: TLog[] }, log: TLog) => {
                const date = new Date(log.created_at);
                date.setSeconds(0, 0);
                const key = date.getTime();
                if (!acc[key]) {
                    acc[key] = [];
                }
                acc[key].push(log);
                return acc;
            },
            {} as { [key: number]: TLog[] }
        );

        const data: ChartPoint<TLog>[] = Object.entries(groupedLogs)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([key, group]) => {
                let sum = 0;
                let count = 0;
                for (const log of group) {
                    const v = getValue(log);
                    if (v !== undefined && v !== null && !isNaN(v as number)) {
                        sum += v as number;
                        count += 1;
                    }
                }
                const avg = count > 0 ? sum / count : null;
                return {
                    x: parseInt(key),
                    y: avg,
                    logs: group,
                    representative: group[0],
                };
            });

        return {
            label: getLabel ? getLabel(city) : city,
            series: city,
            data,
            borderColor: color,
            backgroundColor: `${color}33`,
            pointBackgroundColor: color,
            pointRadius: (context: any) => {
                const point = context.raw as ChartPoint<TLog> | undefined;
                return point && isUnreliable?.(point.representative) ? 5 : 0;
            },
            pointBorderColor: (context: any) => {
                const point = context.raw as ChartPoint<TLog> | undefined;
                return point && isUnreliable?.(point.representative)
                    ? "red"
                    : color;
            },
            pointHoverRadius: 7,
            pointHitRadius: 20,
            tension: 0.2,
            fill: true,
            spanGaps: false,
        };
    });

    const sortedDatasets = [...datasets].sort((a, b) => {
        const aData = a.data
            .map((d) => d.y)
            .filter((v): v is number => v !== null);
        const bData = b.data
            .map((d) => d.y)
            .filter((v): v is number => v !== null);
        const aAvg =
            aData.length > 0
                ? aData.reduce((acc, val) => acc + val, 0) / aData.length
                : 0;
        const bAvg =
            bData.length > 0
                ? bData.reduce((acc, val) => acc + val, 0) / bData.length
                : 0;
        return bAvg - aAvg;
    });

    const chartData = {
        datasets: sortedDatasets,
    };

    const getOptions = (timeRange: string, width: number) => {
        const timeSettings: {
            [key: string]: {
                unit: "day" | "hour" | "minute";
                stepSize?: number;
                displayFormats: { [key: string]: string };
                maxTicksLimit: number;
            };
        } = {
            week: {
                unit: "day",
                displayFormats: {
                    day: "dd.MM",
                },
                maxTicksLimit: 7,
            },
            day: {
                unit: "hour",
                stepSize: 4,
                displayFormats: {
                    hour: "HH:mm",
                },
                maxTicksLimit: 6,
            },
            hour: {
                unit: "minute",
                stepSize: 10,
                displayFormats: {
                    minute: "HH:mm",
                },
                maxTicksLimit: 6,
            },
        };

        const currentTimeSettings = timeSettings[timeRange] || {
            unit: "hour",
            displayFormats: { hour: "HH:mm" },
            maxTicksLimit: 6,
        };

        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: !hideLegend,
                    position: "bottom" as const,
                    labels: {
                        color: "#d4d4d4",
                        usePointStyle: true,
                        pointStyle: "circle",
                    },
                },
                title: {
                    display: false,
                },
                tooltip: {
                    enabled: false,
                    external: function (context: any) {
                        const tooltipId = tooltipIdRef.current;
                        let tooltipEl = document.getElementById(tooltipId);

                        if (!tooltipEl) {
                            tooltipEl = document.createElement("div");
                            tooltipEl.id = tooltipId;
                            tooltipEl.innerHTML = "<div class=\"chartjs-tooltip-scroll\"><table></table></div>";
                            document.body.appendChild(tooltipEl);
                        }

                        if (isPinnedRef.current) {
                            return;
                        }

                        const tooltipModel = context.tooltip;
                        if (tooltipModel.opacity === 0) {
                            tooltipEl.style.opacity = "0";
                            tooltipEl.style.visibility = "hidden";
                            tooltipEl.style.pointerEvents = "none";
                            return;
                        }

                        tooltipEl.classList.remove(
                            "above",
                            "below",
                            "no-transform"
                        );
                        if (tooltipModel.yAlign) {
                            tooltipEl.classList.add(tooltipModel.yAlign);
                        } else {
                            tooltipEl.classList.add("no-transform");
                        }

                        if (tooltipModel.dataPoints && tooltipModel.dataPoints.length > 0) {
                            const firstPoint = tooltipModel.dataPoints[0];
                            const formattedDate = new Date(
                                firstPoint.parsed.x
                            ).toLocaleDateString("ru-RU", {
                                weekday: "short",
                                day: "numeric",
                                month: "long",
                            });
                            const formattedTime = new Date(
                                firstPoint.parsed.x
                            ).toLocaleTimeString("ru-RU", {
                                hour: "2-digit",
                                minute: "2-digit",
                            });

                            type TooltipRow = {
                                label: string;
                                color: string;
                                cells: ChartTooltipCell[];
                                unreliable: boolean;
                            };
                            const rows: TooltipRow[] = [];
                            for (const dp of tooltipModel.dataPoints as any[]) {
                                const point = dp.raw as
                                    | ChartPoint<TLog>
                                    | undefined;
                                if (!point || point.y === null) continue;
                                const dataset = dp.dataset as {
                                    label: string;
                                    series: string;
                                    borderColor: string;
                                };
                                const cells = renderTooltip({
                                    series: dataset.series ?? dataset.label,
                                    label: dataset.label,
                                    point,
                                });
                                rows.push({
                                    label: dataset.label,
                                    color: dataset.borderColor,
                                    cells,
                                    unreliable: Boolean(
                                        isUnreliable?.(point.representative)
                                    ),
                                });
                            }

                            const columnLabels: string[] = [];
                            const seenColumns = new Set<string>();
                            for (const row of rows) {
                                for (const cell of row.cells) {
                                    if (!seenColumns.has(cell.label)) {
                                        seenColumns.add(cell.label);
                                        columnLabels.push(cell.label);
                                    }
                                }
                            }

                            const stickyBg = "rgba(36,36,36,1)";
                            const vDivider = "border-right:1px solid rgba(255,255,255,0.07);";
                            const thStyle =
                                `padding:4px 8px;text-align:right;font-weight:500;color:#aaa;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.1);white-space:nowrap;${vDivider}`;
                            const dateThStyle =
                                `padding:4px 10px 4px 6px;text-align:left;font-weight:700;color:#fff;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.1);white-space:nowrap;position:sticky;left:0;background:${stickyBg};z-index:2;${vDivider}`;
                            const groupThStyle =
                                `padding:4px 8px;text-align:center;font-weight:600;color:#fff;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.15);white-space:nowrap;${vDivider}`;

                            const METRIC_LABELS = new Set([
                                "Общее",
                                "DNS",
                                "TCP",
                                "TLS",
                                "TTFB",
                                "Загрузка",
                            ]);
                            const STANDALONE_LABELS = new Set(["Статус"]);

                            const standaloneCols: string[] = [];
                            const metricCols: string[] = [];
                            const backendCols: string[] = [];
                            for (const col of columnLabels) {
                                if (STANDALONE_LABELS.has(col)) standaloneCols.push(col);
                                else if (METRIC_LABELS.has(col)) metricCols.push(col);
                                else backendCols.push(col);
                            }
                            // "Общее2" (server_timing.total) ставим первым в backend-группе
                            const totalIdx = backendCols.indexOf("Общее2");
                            if (totalIdx > 0) {
                                backendCols.splice(totalIdx, 1);
                                backendCols.unshift("Общее2");
                            }
                            const orderedColumns = [
                                ...standaloneCols,
                                ...metricCols,
                                ...backendCols,
                            ];
                            const showGroups = metricCols.length > 0;

                            let innerHtml = "<thead>";
                            if (showGroups) {
                                innerHtml += `<tr><th rowspan="2" style="${dateThStyle}">${escapeHtml(
                                    `${formattedDate} в ${formattedTime}`
                                )}</th>`;
                                for (const col of standaloneCols) {
                                    innerHtml += `<th rowspan="2" style="${thStyle}">${escapeHtml(
                                        col
                                    )}</th>`;
                                }
                                if (metricCols.length > 0) {
                                    innerHtml += `<th colspan="${metricCols.length}" style="${groupThStyle}">Метрики в мс</th>`;
                                }
                                if (backendCols.length > 0) {
                                    innerHtml += `<th colspan="${backendCols.length}" style="${groupThStyle}">Backend в мс</th>`;
                                }
                                innerHtml += "</tr><tr>";
                                for (const col of metricCols) {
                                    innerHtml += `<th style="${thStyle}">${escapeHtml(
                                        col
                                    )}</th>`;
                                }
                                for (const col of backendCols) {
                                    innerHtml += `<th style="${thStyle}">${escapeHtml(
                                        col
                                    )}</th>`;
                                }
                                innerHtml += "</tr>";
                            } else {
                                innerHtml += `<tr><th style="${dateThStyle}">${escapeHtml(
                                    `${formattedDate} в ${formattedTime}`
                                )}</th>`;
                                for (const col of orderedColumns) {
                                    innerHtml += `<th style="${thStyle}">${escapeHtml(
                                        col
                                    )}</th>`;
                                }
                                innerHtml += "</tr>";
                            }
                            innerHtml += "</thead><tbody>";

                            for (const row of rows) {
                                const cityStyle =
                                    `padding:4px 10px 4px 6px;text-align:left;font-weight:500;color:#fff;white-space:nowrap;` +
                                    `position:sticky;left:0;background:${stickyBg};z-index:1;` +
                                    `box-shadow:inset 0 -2px 0 ${row.color};${vDivider}`;
                                const cityLabelHtml = row.unreliable
                                    ? `${escapeHtml(row.label)} <span style="color:#ff6b6b;font-size:11px;" title="Недостоверный замер">●</span>`
                                    : escapeHtml(row.label);
                                innerHtml += `<tr><th scope="row" style="${cityStyle}">${cityLabelHtml}</th>`;

                                const byLabel = new Map(
                                    row.cells.map((c) => [c.label, c])
                                );
                                for (const col of orderedColumns) {
                                    const cell = byLabel.get(col);
                                    const v = cell?.value ?? "";
                                    const weight = cell?.bold ? "700" : "400";
                                    innerHtml += `<td style="padding:4px 8px;text-align:right;color:#e0e0e0;font-variant-numeric:tabular-nums;font-weight:${weight};${vDivider}">${escapeHtml(
                                        v
                                    )}</td>`;
                                }
                                innerHtml += "</tr>";
                            }
                            innerHtml += "</tbody>";

                            const scrollWrap = tooltipEl.querySelector(
                                ".chartjs-tooltip-scroll"
                            ) as HTMLElement | null;
                            if (scrollWrap) {
                                scrollWrap.setAttribute(
                                    "style",
                                    "overflow-x:auto;overflow-y:hidden;max-width:100%;-webkit-overflow-scrolling:touch;pointer-events:auto;"
                                );
                            }

                            let table = tooltipEl.querySelector("table");
                            if (table) {
                                table.setAttribute(
                                    "style",
                                    "border-collapse:collapse;border-spacing:0;"
                                );
                                table.innerHTML = innerHtml;
                            }
                        }

                        const chart = context.chart;
                        const position = chart.canvas.getBoundingClientRect();

                        tooltipEl.style.opacity = "1";
                        tooltipEl.style.visibility = "visible";
                        tooltipEl.style.position = "absolute";
                        tooltipEl.style.fontFamily =
                            tooltipModel.options.bodyFont.family;
                        tooltipEl.style.fontSize =
                            tooltipModel.options.bodyFont.size + "px";
                        tooltipEl.style.fontStyle =
                            tooltipModel.options.bodyFont.style;
                        tooltipEl.style.pointerEvents = "none";
                        tooltipEl.style.backgroundColor = "rgba(36, 36, 36, 1)";
                        tooltipEl.style.borderRadius = "5px";
                        tooltipEl.style.color = "white";
                        tooltipEl.style.whiteSpace = "normal";
                        tooltipEl.style.padding = "5px";
                        tooltipEl.style.zIndex = "9999";

                        if (isMobile) {
                            tooltipEl.style.width = position.width + "px";
                            tooltipEl.style.maxWidth = position.width + "px";
                            tooltipEl.style.left = position.left + "px";
                            tooltipEl.style.top =
                                position.top + window.pageYOffset + 225 + "px";
                        } else {
                            tooltipEl.style.width = "";
                            tooltipEl.style.maxWidth =
                                "min(600px, calc(100vw - 20px))";
                            let left =
                                position.left +
                                window.pageXOffset +
                                tooltipModel.caretX;
                            let top = position.top + window.pageYOffset + 225;

                            left -= tooltipEl.offsetWidth / 2;

                            if (left < position.left + window.pageXOffset) {
                                left = position.left + window.pageXOffset;
                            }

                            if (
                                left + tooltipEl.offsetWidth >
                                position.right + window.pageXOffset
                            ) {
                                left =
                                    position.right +
                                    window.pageXOffset -
                                    tooltipEl.offsetWidth;
                            }
                            tooltipEl.style.left = left + "px";
                            tooltipEl.style.top = top + "px";
                        }
                    },
                    titleFont: {
                        size: 16,
                    },
                    bodyFont: {
                        size: 14,
                    },
                    callbacks: {
                        label: () => "",
                    },
                },
                crosshair: {
                    enabled: true,
                    line: {
                        color: "#818181ff",
                        width: 2,
                        dashPattern: [6, 6],
                    },
                    snap: {
                        enabled: true,
                    },
                    sync: {
                        enabled: false,
                    },
                    zoom: {
                        enabled: false,
                    },
                },
            },
            interaction: {
                mode: "index" as const,
                intersect: false,
            },
            events: (isMobile
                ? ["click", "touchstart"]
                : ["mousemove", "mouseout", "click", "touchstart"]) as any,
            onClick: (event: any, elements: any[]) => {
                if (elements && elements.length > 0) {
                    isPinnedRef.current = false;
                    const chart = chartRef.current as any;
                    if (chart?.tooltip) {
                        chart.tooltip.setActiveElements(elements, {
                            x: event?.x ?? 0,
                            y: event?.y ?? 0,
                        });
                        const ext = chart?.options?.plugins?.tooltip?.external;
                        if (typeof ext === "function") {
                            ext({ tooltip: chart.tooltip, chart });
                        }
                    }
                    isPinnedRef.current = true;
                }
            },
            scales: {
                y: {
                    display: width > 500,
                    beginAtZero: true,
                    grid: {
                        color: "rgba(255, 255, 255, 0.1)",
                    },
                    ticks: {
                        color: "#d4d4d4",
                        maxTicksLimit: 5,
                    },
                },
                x: {
                    type: "time" as const,
                    time: {
                        unit: currentTimeSettings.unit,
                        stepSize: currentTimeSettings.stepSize,
                        displayFormats: currentTimeSettings.displayFormats,
                        tooltipFormat: "PPP p",
                    },
                    adapters: {
                        date: {
                            locale: ru,
                        },
                    },
                    grid: {
                        color: "rgba(255, 255, 255, 0.1)",
                    },
                    ticks: {
                        color: "#d4d4d4",
                        maxTicksLimit: currentTimeSettings.maxTicksLimit,
                    },
                },
            },
        };
    };

    return (
        <Line
            ref={chartRef as any}
            options={getOptions(timeRange, width) as any}
            data={chartData as any}
            className={styles.chart}
        />
    );
}

export default Chart;
