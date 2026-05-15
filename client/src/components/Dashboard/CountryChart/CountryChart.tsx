import { countries, domains as domainList } from "../../../data/constants.ts";
import ChartPlug from "../../Chart/ChartPlug.tsx";
import CountryChartItem from "../CountryChartItem/CountryChartItem.tsx";
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
    isChartLoading: boolean;
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
    const { type, timeRange, isChartLoading, loading } = props;

    if (type === "domain") {
        return (
            <div className={styles.chartsGrid}>
                {loading
                    ? Array.from({ length: domainList.length }).map((_, i) => (
                          <ChartPlug key={i} />
                      ))
                    : domainList.map((domainName) => {
                          const cityLogs = props.domainLogs[domainName];
                          if (!cityLogs) return null;
                          return (
                              <CountryChartItem
                                  key={domainName}
                                  type="domain"
                                  domainName={domainName}
                                  cityLogs={cityLogs}
                                  cities={Object.keys(cityLogs)}
                                  timeRange={timeRange}
                                  isChartLoading={isChartLoading}
                              />
                          );
                      })}
            </div>
        );
    }

    if (loading) {
        return (
            <div className={styles.chartsGrid}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <ChartPlug key={`top-${i}`} />
                ))}
                {Array.from({ length: 13 }).map((_, i) => (
                    <ChartPlug key={`bottom-${i}`} />
                ))}
            </div>
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
                                    <CountryChartItem
                                        key={countryCode}
                                        type="country"
                                        countryCode={countryCode}
                                        countryName={countryName}
                                        intervalMinutes={intervalMinutes}
                                        cityLogs={
                                            props.httpLogs[countryCode] || {}
                                        }
                                        cities={cities}
                                        timeRange={timeRange}
                                        isChartLoading={isChartLoading}
                                    />
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
