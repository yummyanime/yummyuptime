import ReactCountryFlag from "react-country-flag";
import { NavLink } from "react-router-dom";
import Chart from "../../Chart/Chart.tsx";
import { httpRequestTimePreset } from "../../Chart/chartPresets.ts";
import styles from "./CountryChartItem.module.scss";

interface CityLogs {
    [city: string]: any[];
}

type CountryChartItemProps = {
    cityLogs: CityLogs;
    cities: string[];
    timeRange: string;
    isChartLoading: boolean;
} & (
    | {
          type: "country";
          countryCode: string;
          countryName: string;
          intervalMinutes: number;
      }
    | {
          type: "domain";
          domainName: string;
      }
);

const CountryItemHeader = ({
    countryCode,
    countryName,
    intervalMinutes,
}: {
    countryCode: string;
    countryName: string;
    intervalMinutes: number;
}) => (
    <>
        <div className={styles.countryIdentifier}>
            <ReactCountryFlag
                countryCode={countryCode}
                svg
                style={{
                    width: "24px",
                    height: "16px",
                    borderRadius: "5px",
                }}
                title={countryName}
            />
            <p className={styles.itemName}>{countryName}</p>
        </div>
        <div
            className={styles.checkInterval}
            title={`Каждая проверка происходит раз в ${intervalMinutes} минут`}
        >
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>{intervalMinutes}м</span>
        </div>
    </>
);

const DomainItemHeader = ({ domainName }: { domainName: string }) => (
    <>
        <p className={styles.itemName}>{domainName}</p>
        <NavLink to={`${domainName}`}>
            <button>Подробнее</button>
        </NavLink>
    </>
);

const CountryChartItem = (props: CountryChartItemProps) => {
    const { cityLogs, cities, timeRange, isChartLoading } = props;

    return (
        <div className={styles.chartCard}>
            <div className={styles.cardHeader}>
                {props.type === "country" ? (
                    <CountryItemHeader
                        countryCode={props.countryCode}
                        countryName={props.countryName}
                        intervalMinutes={props.intervalMinutes}
                    />
                ) : (
                    <DomainItemHeader domainName={props.domainName} />
                )}
            </div>
            <div className={styles.chartContainer}>
                <Chart
                    cityLogs={cityLogs}
                    cities={cities}
                    timeRange={timeRange}
                    isChartLoading={isChartLoading}
                    {...httpRequestTimePreset}
                />
            </div>
        </div>
    );
};

export default CountryChartItem;
