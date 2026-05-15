import { Line } from "react-chartjs-2";
import { useRef, useEffect, useState } from "react";
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

export interface ChartProps<TLog extends ChartLog> {
    cityLogs: Record<string, TLog[]>;
    cities: string[];
    timeRange: string;
    isChartLoading: boolean;
    hideLegend?: boolean;
    getValue: (log: TLog) => number | null | undefined;
    getLabel?: (series: string) => string;
    isUnreliable?: (representative: TLog) => boolean;
    renderTooltip: (ctx: ChartTooltipContext<TLog>) => string[];
}

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

    useEffect(() => {
        const chart = chartRef.current;
        if (chart) {
            if (isChartLoading) {
                chart.canvas.classList.add(styles.chartLoading);
            } else {
                chart.canvas.classList.remove(styles.chartLoading);
            }
        }
    }, [isChartLoading]);

    useEffect(() => {
        return () => {
            const tooltipEl = document.getElementById("chartjs-tooltip");
            if (tooltipEl) {
                tooltipEl.remove();
            }
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
                        let tooltipEl =
                            document.getElementById("chartjs-tooltip");

                        if (!tooltipEl) {
                            tooltipEl = document.createElement("div");
                            tooltipEl.id = "chartjs-tooltip";
                            tooltipEl.innerHTML = "<table></table>";
                            document.body.appendChild(tooltipEl);
                        }

                        const tooltipModel = context.tooltip;
                        if (tooltipModel.opacity === 0) {
                            tooltipEl.style.opacity = "0";
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

                        function getBody(bodyItem: any) {
                            return bodyItem.lines;
                        }

                        if (tooltipModel.body) {
                            const bodyLines = tooltipModel.body.map(getBody);

                            let innerHtml = "<thead>";

                            if (tooltipModel.dataPoints.length > 0) {
                                const firstPoint = tooltipModel.dataPoints[0];
                                if (firstPoint && firstPoint.parsed) {
                                    const formattedDate = new Date(
                                        firstPoint.parsed.x
                                    ).toLocaleDateString("ru-RU", {
                                        weekday: "long",
                                        day: "numeric",
                                        month: "long",
                                    });
                                    const formattedTime = new Date(
                                        firstPoint.parsed.x
                                    ).toLocaleTimeString("ru-RU", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    });
                                    innerHtml +=
                                        "<tr><th>" +
                                        formattedDate +
                                        " в " +
                                        formattedTime +
                                        "</th></tr>";
                                }
                            }
                            innerHtml += "</thead><tbody>";

                            bodyLines.forEach(function (body: any, i: any) {
                                const colors = tooltipModel.labelColors[i];
                                let style = "background:" + colors.borderColor;
                                style += "; border-color:" + colors.borderColor;
                                style += "; border-width: 2px";
                                style += "; margin-right: 5px";
                                style += "; height: 10px";
                                style += "; width: 10px";
                                style += "; display: inline-block";
                                style += "; border-radius: 50%";
                                const span =
                                    '<span style="' + style + '"></span>';
                                innerHtml +=
                                    "<tr><td>" + span + body + "</td></tr>";
                            });
                            innerHtml += "</tbody>";

                            let table = tooltipEl.querySelector("table");
                            if (table) {
                                table.innerHTML = innerHtml;
                            }
                        }

                        const chart = context.chart;
                        const position = chart.canvas.getBoundingClientRect();

                        tooltipEl.style.opacity = "1";
                        tooltipEl.style.position = "absolute";
                        tooltipEl.style.fontFamily =
                            tooltipModel.options.bodyFont.family;
                        tooltipEl.style.fontSize =
                            tooltipModel.options.bodyFont.size + "px";
                        tooltipEl.style.fontStyle =
                            tooltipModel.options.bodyFont.style;
                        tooltipEl.style.padding =
                            tooltipModel.padding +
                            "px " +
                            tooltipModel.padding +
                            "px";
                        tooltipEl.style.pointerEvents = "none";
                        tooltipEl.style.backgroundColor = "rgba(36, 36, 36, 1)";
                        tooltipEl.style.borderRadius = "5px";
                        tooltipEl.style.color = "white";
                        tooltipEl.style.maxWidth = "500px";
                        tooltipEl.style.whiteSpace = "normal";
                        tooltipEl.style.wordWrap = "break-word";
                        tooltipEl.style.padding = "5px";
                        tooltipEl.style.zIndex = "9999";

                        if (width <= 500) {
                            tooltipEl.style.width = position.width + "px";
                            tooltipEl.style.left = position.left + "px";
                            tooltipEl.style.top =
                                position.top + window.pageYOffset + 225 + "px";
                        } else {
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
                        label: function (context: any) {
                            const dataset = context.dataset as {
                                label: string;
                                series: string;
                            };
                            const point = context.raw as
                                | ChartPoint<TLog>
                                | undefined;

                            if (!point) return "";

                            const lines = renderTooltip({
                                series: dataset.series ?? dataset.label,
                                label: dataset.label,
                                point,
                            });
                            return lines.join(" | ");
                        },
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
