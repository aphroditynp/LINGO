import { useEffect, useState } from "react";
import API from "../api";
import { lingoPresence } from "./lingoPresence";
import "./LingoStatus.css";

const REFRESH_MS = 30000;

export function PresenceBadge({ device, now }) {
    const p = lingoPresence(device, now);
    return (
        <span className={`lingo-presence ${p.tone}`} title={p.detail}>
            <i aria-hidden="true" />
            {p.label}
        </span>
    );
}

// Kartu kecil di Dashboard: apakah LINGO anak sedang hidup.
export default function LingoStatus({ userId }) {
    const [devices, setDevices] = useState([]);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!userId) return undefined;
        let cancelled = false;
        const load = () => API.get(`/users/${encodeURIComponent(userId)}/wifi`)
            .then((res) => { if (!cancelled) { setDevices(res.data); setNow(Date.now()); } })
            .catch(() => {});
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => { cancelled = true; clearInterval(timer); };
    }, [userId]);

    if (devices.length === 0) return null;

    return (
        <div className="lingo-status-list" aria-live="polite">
            {devices.map((device) => {
                const p = lingoPresence(device, now);
                return (
                    <div key={device.device_id} className={`lingo-status ${p.tone}`}>
                        <PresenceBadge device={device} now={now} />
                        <div>
                            <strong>{device.device_id}</strong>
                            <span>{p.detail}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
