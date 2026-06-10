import React from "react";
import Dashboard from "../components/Dashboard/Dashboard.tsx";
import { usePageMeta } from "../hooks/usePageMeta.ts";

const Home: React.FC = () => {
    usePageMeta(
        "YummyUptime — мониторинг доступности сайта Ями Аниме | YummyAnime",
        "Мониторинг доступности сайта Ями Аниме | YummyAnime: аптайм, время отклика. Работает ли сайт в России, Беларуси, Украине, Казахстане и других странах?"
    );

    return <Dashboard />;
};

export default Home;
