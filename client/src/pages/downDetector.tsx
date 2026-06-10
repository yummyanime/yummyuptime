import React, { useCallback, useEffect, useState } from "react";
import ReportBlock from "../components/ReportBlock/ReportBlock.tsx";
import ReportChart from "../components/ReportChart/ReportChart.tsx";
import ReportList from "../components/ReportList/ReportList.tsx";
import { usePageMeta } from "../hooks/usePageMeta.ts";
import type { OutageData } from "../data/outage.ts";

const DownDetector: React.FC = () => {
    usePageMeta(
        "Работает ли сайт Ями Аниме | YummyAnime",
        "Работает ли сейчас в данный момент сайт Ями Аниме | YummyAnime? Узнать когда починят сайт, сбои, блокировки и другие проблемы с доступом"
    );

    const [data, setData] = useState<OutageData | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch("/outage-reports");
            if (res.ok) {
                setData(await res.json());
            }
        } catch (e) {
            console.error("Error fetching outage reports:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <>
            <ReportBlock onReported={fetchData} />
            <ReportChart data={data} loading={loading} />
            <ReportList data={data} loading={loading} />
        </>
    );
};

export default DownDetector;
