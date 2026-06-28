import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import styles from "./Dashboard.module.scss";
import Menu from "../Menu/Menu.tsx";
import Status from "../Status/Status.tsx";
import Overview from "../Overview/Overview.tsx";
import { useDataStatus } from "../../context/DataStatusContext.tsx";
import { useDashboardSettings } from "../../context/DashboardSettingsContext.tsx";
import CountryChart from "../CountryChart/CountryChart.tsx";
import Lighthouse from "../Lighthouse/Lighthouse.tsx";
import { CHART_SPIKE_MS } from "../../data/constants.ts";

interface Log {
    created_at: string;
    domain?: string;
    country?: string;
    city?: string;
    status_code?: number;
    total_time?: number;
    download_time?: number;
    first_byte_time?: number;
    dns_time?: number;
    tls_time?: number;
    tcp_time?: number;
    unreliable?: boolean;
    server_timing?: Record<string, number> | null;
}

interface CityLogs {
    [city: string]: Log[];
}

interface CountryLogs {
    [country: string]: CityLogs;
}

interface Location {
    country: string;
    city: string;
}

interface LocationGroups {
    [interval: string]: Location[];
}

const Dashboard = () => {
    const allowedCountries = ["RU", "UA", "BY"];
    const [httpLogs, setHttpLogs] = useState<CountryLogs>({});
    const [locationGroups, setLocationGroups] = useState<LocationGroups>({});
    const [domainLogs, setDomainLogs] = useState<{
        [domain: string]: CityLogs;
    }>({});
    const [loading, setLoading] = useState(true);
    const [isChartLoading, setChartLoading] = useState(false);
    const { setStatus } = useDataStatus();
    const {
        timeRange,
        autoRefresh,
        hideUnreliable,
        dateRange,
        effectiveTimeRange,
    } = useDashboardSettings();
    const { domain } = useParams<{ domain: string }>();
    const [allLogs, setAllLogs] = useState<Log[]>([]);
    const [pingLogs, setPingLogs] = useState<any[]>([]);

    const trimCityLogsByTimeRange = (cityLogsMap: CityLogs) => {
        let minTime = Infinity;
        let maxTime = -Infinity;

        for (const city in cityLogsMap) {
            const logs = cityLogsMap[city];
            if (logs.length > 0) {
                const firstTime = new Date(logs[0].created_at).getTime();
                const lastTime = new Date(logs[logs.length - 1].created_at).getTime();

                minTime = Math.min(minTime, firstTime);
                maxTime = Math.max(maxTime, lastTime);
            }
        }

        if (minTime === Infinity || maxTime === -Infinity) {
            return cityLogsMap;
        }

        const trimmedLogs: CityLogs = {};
        for (const city in cityLogsMap) {
            trimmedLogs[city] = cityLogsMap[city].filter((log) => {
                const logTime = new Date(log.created_at).getTime();
                return logTime >= minTime && logTime <= maxTime;
            });
        }

        return trimmedLogs;
    };

    const buildQuery = (extra: Record<string, string> = {}) => {
        const params = new URLSearchParams();
        if (dateRange) {
            params.set("dateFrom", dateRange.from);
            params.set("dateTo", dateRange.to);
        } else {
            params.set("timeRange", timeRange);
        }
        for (const [k, v] of Object.entries(extra)) params.set(k, v);
        return params.toString();
    };

    const fetchData = async () => {
        try {
            let logsData: CountryLogs = {};
            let domainLogsData: { [domain: string]: CityLogs } = {};
            let rawLogs: Log[] = [];

            if (domain) {
                const [logsResponse, locationsResponse] = await Promise.all([
                    fetch(`/http-logs?${buildQuery({ domain })}`),
                    fetch("/locations"),
                ]);

                if (!logsResponse.ok) {
                    throw new Error(
                        `HTTP error! status: ${logsResponse.status}`
                    );
                }
                if (!locationsResponse.ok) {
                    throw new Error(
                        `HTTP error! status: ${locationsResponse.status}`
                    );
                }

                const data = await logsResponse.json();

                logsData = Object.entries(data).reduce((acc, [country, countryData]: [string, any]) => {
                    acc[country] = Object.entries(countryData).reduce((cityAcc, [city, cityData]: [string, any]) => {
                        cityAcc[city] = cityData.map((log: any) => ({
                            ...log,
                            country,
                            city,
                        }));
                        return cityAcc;
                    }, {} as CityLogs);
                    return acc;
                }, {} as CountryLogs);

                rawLogs = Object.values(logsData).flatMap(
                    (countryData: any) =>
                        Object.values(countryData).flatMap(
                            (cityData: any) => cityData
                        )
                );

                const processedLogsData: CountryLogs = {};
                for (const countryKey in logsData) {
                    processedLogsData[countryKey] = trimCityLogsByTimeRange(logsData[countryKey]);
                }
                logsData = processedLogsData;

                const locationsData: LocationGroups =
                    await locationsResponse.json();
                setLocationGroups(locationsData);
            } else {
                const response = await fetch(`/http-logs?${buildQuery()}`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data: Log[] = await response.json();
                rawLogs = data;

                const filteredData = data.filter(
                    (log) =>
                        log.country && allowedCountries.includes(log.country)
                );

                const rawGroupedByDomain = filteredData.reduce(
                    (acc, log) => {
                        if (log.domain && log.city) {
                            const domain = log.domain;
                            const city = log.city;
                            if (!acc[domain]) {
                                acc[domain] = {};
                            }
                            if (!acc[domain][city]) {
                                acc[domain][city] = [];
                            }
                            acc[domain][city].push(log);
                        }
                        return acc;
                    },
                    {} as { [domain: string]: CityLogs }
                );

                for (const domainKey in rawGroupedByDomain) {
                    const logsForDomain = rawGroupedByDomain[domainKey];
                    domainLogsData[domainKey] = trimCityLogsByTimeRange(logsForDomain);
                }
            }
            const processCityLogs = (cityLogsMap: CityLogs): CityLogs => {
                const filteredLogs: CityLogs = {};
                for (const city in cityLogsMap) {
                    const cityLogs = cityLogsMap[city];
                    let lastValidLog: Log | null = null;

                    const processedLogs = cityLogs.map((log, i) => {
                        const isHighPing = (log.total_time ?? 0) > CHART_SPIKE_MS;
                        let isUnreliable = false;

                        if (isHighPing) {
                            const prev = cityLogs[i - 1];
                            const isPrevHigh = (prev?.total_time ?? 0) > CHART_SPIKE_MS;

                            if (!isPrevHigh) {
                                isUnreliable = true;
                            }
                        }

                        if (isUnreliable) {
                            if (lastValidLog) {
                                return {
                                    ...log,
                                    total_time: lastValidLog.total_time,
                                    download_time: lastValidLog.download_time,
                                    first_byte_time: lastValidLog.first_byte_time,
                                    dns_time: lastValidLog.dns_time,
                                    tls_time: lastValidLog.tls_time,
                                    tcp_time: lastValidLog.tcp_time,
                                    server_timing: lastValidLog.server_timing,
                                    unreliable: true,
                                };
                            } else {
                                const firstValid = cityLogs.find(
                                    (l) => (l.total_time ?? 0) <= CHART_SPIKE_MS
                                );
                                if (firstValid) {
                                    return {
                                        ...log,
                                        total_time: firstValid.total_time,
                                        download_time: firstValid.download_time,
                                        first_byte_time: firstValid.first_byte_time,
                                        dns_time: firstValid.dns_time,
                                        tls_time: firstValid.tls_time,
                                        tcp_time: firstValid.tcp_time,
                                        server_timing: firstValid.server_timing,
                                        unreliable: true,
                                    };
                                }
                            }
                        } else if (!isHighPing) {
                            lastValidLog = log;
                        }
                        return log;
                    });

                    filteredLogs[city] = processedLogs;
                }
                return filteredLogs;
            };

            if (hideUnreliable) {
                if (domain) {
                    const filteredCountryLogs: CountryLogs = {};
                    for (const country in logsData) {
                        filteredCountryLogs[country] = processCityLogs(
                            logsData[country]
                        );
                    }
                    setHttpLogs(filteredCountryLogs);
                } else {
                    const filteredDomainLogs: { [domain: string]: CityLogs } = {};
                    for (const domainKey in domainLogsData) {
                        filteredDomainLogs[domainKey] = processCityLogs(
                            domainLogsData[domainKey]
                        );
                    }
                    setDomainLogs(filteredDomainLogs);
                }
            } else {
                if (domain) {
                    setHttpLogs(logsData);
                } else {
                    setDomainLogs(domainLogsData);
                }
            }
            if (domain) {
                rawLogs = Object.values(logsData).flatMap(countryData =>
                    Object.values(countryData).flatMap(cityData => cityData)
                );
            } else {
                rawLogs = Object.values(domainLogsData).flatMap(domainData =>
                    Object.values(domainData).flatMap(cityData => cityData)
                );
            }
            setAllLogs(rawLogs);

            try {
                const pingUrl = domain
                    ? `/ping-logs?${buildQuery({ domain })}`
                    : `/ping-logs?${buildQuery()}`;
                const pingResponse = await fetch(pingUrl);
                if (pingResponse.ok) {
                    const pingData = await pingResponse.json();
                    setPingLogs(pingData);
                }
            } catch (e) {
                console.error("Error fetching ping data:", e);
            }

            setStatus("dashboard", "success");
        } catch (e: any) {
            console.error("Error fetching data:", e);
            if (
                Object.keys(httpLogs).length > 0 ||
                Object.keys(domainLogs).length > 0
            ) {
                setStatus("dashboard", "stale");
            } else {
                setStatus("dashboard", "error");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        setStatus("dashboard", "loading");
        fetchData();
    }, [domain]);

    useEffect(() => {
        setChartLoading(true);
        fetchData().finally(() => setChartLoading(false));
    }, [timeRange, hideUnreliable, dateRange?.from, dateRange?.to]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                fetchData();
            }
        };

        if (autoRefresh) {
            document.addEventListener("visibilitychange", handleVisibilityChange);
        }

        return () => {
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange
            );
        };
    }, [domain, timeRange, autoRefresh, hideUnreliable, dateRange?.from, dateRange?.to]);

    const controls = (
        <div className={styles.controls}>
            <Menu />
        </div>
    );

    if (!domain) {
        return (
            <div className={styles.dashboard} style={{ marginBottom: "140px" }}>
                {controls}
                <Overview
                    allLogs={allLogs}
                    pingLogs={pingLogs}
                    loading={loading}
                    timeRange={effectiveTimeRange}
                    domain={domain}
                />
                <Status
                    allLogs={allLogs}
                    loading={loading}
                    timeRange={effectiveTimeRange}
                />
                <CountryChart
                    type="domain"
                    domainLogs={domainLogs}
                    timeRange={effectiveTimeRange}
                    isChartLoading={isChartLoading}
                    loading={loading}
                />
            </div>
        );
    }

    return (
        <div className={styles.dashboard}>
            {controls}
            <Overview
                allLogs={allLogs}
                pingLogs={pingLogs}
                loading={loading}
                timeRange={effectiveTimeRange}
                domain={domain}
            />
            <Status
                allLogs={allLogs}
                domain={domain}
                loading={loading}
                timeRange={effectiveTimeRange}
            />
            <CountryChart
                type="country"
                locationGroups={locationGroups}
                httpLogs={httpLogs}
                timeRange={effectiveTimeRange}
                isChartLoading={isChartLoading}
                loading={loading}
            />
            <Lighthouse domain={domain} />
        </div>
    );
};

export default Dashboard;
