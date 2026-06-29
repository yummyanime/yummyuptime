import styles from "./StatusPlug.module.scss";

import { domains, getDomainLabel } from "../../../data/constants.ts";

interface StatusPlugProps {
    domain?: string;
}

const StatusPlug: React.FC<StatusPlugProps> = ({ domain }) => {
    const domainsToRender = domain ? [domain] : domains;

    return (
        <div className={styles.statusContainer}>
            {domainsToRender.map((d) => (
                <div key={d} className={styles.domainSection}>
                    <h4>{getDomainLabel(d)}</h4>
                    <div className={styles.requests}></div>
                </div>
            ))}
        </div>
    );
};

export default StatusPlug;
