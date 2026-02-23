import React from "react";
import { Link } from "react-router-dom"; // Импортируем Link
import styles from "./Footer.module.scss";
import { domains } from "../../data/constants.ts";

const Footer: React.FC = () => {
    const currentYear = new Date().getFullYear();
    const yearText = currentYear === 2025 ? "2025" : `2025-${currentYear}`;

    return (
        <footer className={styles.footer}>
            <div className={styles.links}>
                {domains.map((domain, index) => (
                    <Link key={index} to={`${domain}`}>
                        {domain}
                    </Link>
                ))}
            </div>
            <p className={styles.text}>
                Yummy Uptime {yearText}. Создано специально для проектов Yummy.
            </p>
        </footer>
    );
};

export default Footer;
