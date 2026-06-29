import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./LazyMount.module.scss";

interface LazyMountProps {
    children: ReactNode;
    placeholder?: ReactNode;
    fill?: boolean;
    rootMargin?: string;
}

const LazyMount = ({
    children,
    placeholder,
    fill = false,
    rootMargin = "300px",
}: LazyMountProps) => {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        if (typeof IntersectionObserver === "undefined") {
            setVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin }
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, [rootMargin]);

    return (
        <div ref={ref} className={fill ? styles.fill : styles.block}>
            {visible
                ? children
                : placeholder ?? <div className={styles.placeholder} />}
        </div>
    );
};

export default LazyMount;
