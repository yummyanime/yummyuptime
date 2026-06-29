import { countries, domainGroups } from "../../data/constants.ts";
import ChartPlug from "../Chart/_plug/ChartPlug.tsx";
import LazyMount from "../LazyMount/LazyMount.tsx";
import CountryChartItem from "./CountryChartItem/CountryChartItem.tsx";
import styles from "./CountryChart.module.scss";

interface Log {
    created_at: string;
    [key: string]: any;
}

interface CityLogs {
    [city: string]: Log[];
}

interface CountryLogs {
    [country: string]: CityLogs;
}

interface DomainLogsMap {
    [domain: string]: CityLogs;
}

interface Location {
    country: string;
    city: string;
}

interface LocationGroups {
    [interval: string]: Location[];
}

type CountryChartProps = {
    timeRange: string;
    loading: boolean;
} & (
    | {
          type: "country";
          locationGroups: LocationGroups;
          httpLogs: CountryLogs;
      }
    | {
          type: "domain";
          domainLogs: DomainLogsMap;
      }
);

const groupLocationsByCountry = (locations: Location[]) =>
    locations
        .reduce(
            (acc, { country, city }) => {
                let group = acc.find((g) => g.countryCode === country);
                if (!group) {
                    group = { countryCode: country, cities: [] };
                    acc.push(group);
                }
                group.cities.push(city);
                return acc;
            },
            [] as { countryCode: string; cities: string[] }[]
        )
        .sort(
            (a, b) =>
                countries.findIndex((c) => c.code === a.countryCode) -
                countries.findIndex((c) => c.code === b.countryCode)
        );

const CountryChart = (props: CountryChartProps) => {
    const { type, timeRange, loading } = props;

    if (type === "domain") {
        if (loading) {
            return (
                <>
                    {domainGroups.map((group, index) => (
                        <div key={group.title} className={styles.chartGroup}>
                            <h3 className={styles.groupTitle}>{group.title}</h3>
                            <div className={styles.chartsGrid}>
                                {group.domains.map((entry) => (
                                    <ChartPlug
                                        key={entry.value}
                                        domainName={entry.value}
                                    />
                                ))}
                            </div>
                            {index < domainGroups.length - 1 && (
                                <hr className={styles.chartDivider} />
                            )}
                        </div>
                    ))}
                </>
            );
        }

        const visibleGroups = domainGroups
            .map((group) => ({
                title: group.title,
                entries: group.domains.filter(
                    (entry) => props.domainLogs[entry.value]
                ),
            }))
            .filter((group) => group.entries.length > 0);

        return (
            <>
                {visibleGroups.map((group, index) => (
                    <div key={group.title} className={styles.chartGroup}>
                        <h3 className={styles.groupTitle}>{group.title}</h3>
                        <div className={styles.chartsGrid}>
                            {group.entries.map((entry) => (
                                <LazyMount
                                    key={entry.value}
                                    placeholder={
                                        <ChartPlug domainName={entry.value} />
                                    }
                                >
                                    <CountryChartItem
                                        type="domain"
                                        domainName={entry.value}
                                        cityLogs={props.domainLogs[entry.value]}
                                        cities={Object.keys(
                                            props.domainLogs[entry.value]
                                        )}
                                        timeRange={timeRange}
                                    />
                                </LazyMount>
                            ))}
                        </div>
                        {index < visibleGroups.length - 1 && (
                            <hr className={styles.chartDivider} />
                        )}
                    </div>
                ))}
            </>
        );
    }

    if (loading) {
        const groupCounts = [4, 13];
        return (
            <>
                {groupCounts.map((count, index) => (
                    <div key={index} className={styles.chartGroup}>
                        <div className={styles.chartsGrid}>
                            {Array.from({ length: count }).map((_, i) => (
                                <ChartPlug key={`${index}-${i}`} />
                            ))}
                        </div>
                        {index < groupCounts.length - 1 && (
                            <hr className={styles.chartDivider} />
                        )}
                    </div>
                ))}
            </>
        );
    }

    const intervals = Object.keys(props.locationGroups);

    return (
        <>
            {intervals.map((interval, index) => {
                const intervalMinutes = parseInt(interval.replace("min", ""));
                const countryGroups = groupLocationsByCountry(
                    props.locationGroups[interval]
                );

                return (
                    <div key={interval} className={styles.chartGroup}>
                        <div className={styles.chartsGrid}>
                            {countryGroups.map(({ countryCode, cities }) => {
                                const country = countries.find(
                                    (c) => c.code === countryCode
                                );
                                const countryName = country
                                    ? country.name
                                    : countryCode;

                                return (
                                    <LazyMount
                                        key={countryCode}
                                        placeholder={<ChartPlug />}
                                    >
                                        <CountryChartItem
                                            type="country"
                                            countryCode={countryCode}
                                            countryName={countryName}
                                            intervalMinutes={intervalMinutes}
                                            cityLogs={
                                                props.httpLogs[countryCode] || {}
                                            }
                                            cities={cities}
                                            timeRange={timeRange}
                                        />
                                    </LazyMount>
                                );
                            })}
                        </div>
                        {index < intervals.length - 1 && (
                            <hr className={styles.chartDivider} />
                        )}
                    </div>
                );
            })}
        </>
    );
};

export default CountryChart;
