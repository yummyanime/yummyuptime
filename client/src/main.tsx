import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./main.scss";
import Footer from "./components/Footer/Footer.tsx";
import Dashboard from "./components/Dashboard/Dashboard.tsx";
import Header from "./components/Header/Header.tsx";
import StaleDataWarning from "./components/StaleDataWarning/StaleDataWarning.tsx";
import {
    DataStatusProvider,
    useDataStatus,
} from "./context/DataStatusContext.tsx";
import { DashboardSettingsProvider } from "./context/DashboardSettingsContext.tsx";

function App() {
    const { isAnyError, isAnyStale } = useDataStatus();

    return (
        <>
            <Header />
            <div className="app-container">
                {(isAnyStale || isAnyError) && (
                    <StaleDataWarning isError={isAnyError} />
                )}
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/:domain" element={<Dashboard />} />
                </Routes>
            </div>
            <Footer />
        </>
    );
}

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <BrowserRouter>
            <DataStatusProvider>
                <DashboardSettingsProvider>
                    <App />
                </DashboardSettingsProvider>
            </DataStatusProvider>
        </BrowserRouter>
    </StrictMode>
);
