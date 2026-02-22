import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import styles from "./GlobalpingMap.module.scss";

// Фикс иконок для Leaflet в React
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

const ActiveIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [35, 50],
    iconAnchor: [17, 50],
    className: styles.activeMarker
});

interface Probe {
    location: {
        city: string;
        country: string;
        latitude: number;
        longitude: number;
    };
    status: string;
}

interface Location {
    country: string;
    city: string;
}

interface ProbesData {
    all: Probe[];
    active: { [key: string]: Location[] };
}

const GlobalpingMap = () => {
    const [data, setData] = useState<ProbesData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProbes = async () => {
            setLoading(true);
            try {
                const response = await fetch("/probes");
                console.log("Probes fetch response status:", response.status, response.statusText);
                if (response.ok) {
                    const probesData = await response.json();
                    console.log("Probes data:", probesData);
                    setData(probesData);
                } else {
                    const errorText = await response.text();
                    console.error("Probes fetch error response body:", errorText);
                }
            } catch (err) {
                console.error("Failed to fetch probes:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchProbes();
    }, []);

    if (loading || !data) {
        return (
            <div className={styles.mapPlaceholder}>
                Загрузка карты узлов мониторинга...
            </div>
        );
    }

    const activeLocations = Object.values(data.active).flat();
    
    // Фильтруем только те пробы, которые входят в наш список мониторинга
    const ourProbes = data.all.filter(probe => 
        activeLocations.some(
            loc => loc.city.toLowerCase() === probe.location.city.toLowerCase() && 
                   loc.country.toUpperCase() === probe.location.country.toUpperCase()
        )
    );

    return (
        <div className={styles.mapContainer}>
            <div className={styles.header}>
                <h3 className={styles.title}>Карта мониторинга ({ourProbes.length} узлов)</h3>
            </div>
            <div className={styles.mapWrapper}>
                <MapContainer
                    center={[50, 40] as any} // Центрируем ближе к Евразии
                    zoom={3}
                    className={styles.leafletContainer}
                    scrollWheelZoom={false}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    />
                    {ourProbes.map((probe, idx) => (
                        <Marker
                            key={idx}
                            position={[probe.location.latitude, probe.location.longitude] as any}
                            icon={ActiveIcon}
                        >
                            <Popup>
                                <div className={styles.popupContent}>
                                    <strong>{probe.location.city}, {probe.location.country}</strong>
                                    <br />
                                    Статус: {probe.status}
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>
        </div>
    );
};

export default GlobalpingMap;
