import { useCallback, useEffect, useState } from "react";
import API from "../api";
import "./WifiCard.css";

function relativeTime(iso) {
    if (!iso) return null;
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return "baru saja";
    if (minutes < 60) return `${minutes} menit lalu`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} jam lalu`;
    return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function signalLabel(rssi) {
    if (rssi == null) return null;
    if (rssi >= -60) return "sinyal kuat";
    if (rssi >= -70) return "sinyal sedang";
    return "sinyal lemah";
}

// Gabungkan WiFi yang tersimpan di LINGO dengan perubahan yang belum terkirim.
function wifiRows(device) {
    const rows = device.saved.map((ssid) => ({
        ssid,
        connected: ssid === device.connected_ssid,
        removing: device.pending_remove.includes(ssid),
        adding: false,
    }));
    for (const ssid of device.pending_add) {
        const row = rows.find((r) => r.ssid === ssid);
        if (row) row.updating = true;
        else rows.push({ ssid, connected: false, removing: false, adding: true });
    }
    return rows;
}

function DeviceWifi({ userId, device, onChanged }) {
    const [ssid, setSsid] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState({ text: "", error: false });

    const rows = wifiRows(device);
    const base = `/users/${encodeURIComponent(userId)}/devices/${encodeURIComponent(device.device_id)}/wifi`;

    const handleAdd = async (event) => {
        event.preventDefault();
        if (!ssid.trim()) return setMessage({ text: "Nama WiFi wajib diisi.", error: true });
        if (password && password.length < 8) {
            return setMessage({ text: "Password WiFi minimal 8 karakter, atau kosongkan untuk WiFi tanpa password.", error: true });
        }
        try {
            setBusy(true);
            await API.post(base, { ssid: ssid.trim(), password });
            setSsid("");
            setPassword("");
            setShowPassword(false);
            setMessage({ text: `${ssid.trim()} akan dikirim ke LINGO saat LINGO menyala dan online.`, error: false });
            onChanged();
        } catch (error) {
            setMessage({ text: error.response?.data?.error || "Gagal menambah WiFi.", error: true });
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async (row) => {
        const warning = row.connected
            ? `\n\nLINGO sedang memakai WiFi ini. Setelah dihapus, LINGO pindah ke WiFi tersimpan lain. ` +
              `Jika tidak ada, LINGO tetap bisa dipakai tanpa internet sampai WiFi baru diatur.`
            : "";
        if (!row.adding && !window.confirm(`Hapus WiFi "${row.ssid}" dari ${device.device_id}?${warning}`)) return;
        try {
            setBusy(true);
            await API.delete(base, { params: { ssid: row.ssid } });
            setMessage({
                text: row.adding ? `${row.ssid} dibatalkan.` : `${row.ssid} akan dihapus saat LINGO online.`,
                error: false,
            });
            onChanged();
        } catch (error) {
            setMessage({ text: error.response?.data?.error || "Gagal menghapus WiFi.", error: true });
        } finally {
            setBusy(false);
        }
    };

    const reported = relativeTime(device.reported_at);
    const full = device.saved.length + device.pending_add.filter((s) => !device.saved.includes(s)).length
        - device.pending_remove.length >= device.max_saved;

    return (
        <div className="wifi-device">
            <div className="wifi-device-head">
                <strong>{device.device_id}</strong>
                <span className={device.connected_ssid ? "wifi-status online" : "wifi-status"}>
                    {!reported
                        ? "Belum melapor (perlu firmware terbaru)"
                        : device.connected_ssid
                            ? `Terhubung ke ${device.connected_ssid}${signalLabel(device.rssi) ? ` · ${signalLabel(device.rssi)}` : ""}`
                            : "Tidak terhubung"}
                </span>
            </div>
            {reported && <p className="wifi-reported">Dilaporkan LINGO {reported}</p>}

            {rows.length === 0 ? (
                <p className="wifi-empty">Belum ada WiFi tersimpan di LINGO ini.</p>
            ) : (
                <ul className="wifi-list">
                    {rows.map((row) => (
                        <li key={row.ssid} className={row.removing ? "removing" : ""}>
                            <span className="wifi-name">📶 {row.ssid}</span>
                            <span className="wifi-badges">
                                {row.connected && !row.removing && <em className="badge-online">Sedang dipakai</em>}
                                {row.adding && <em className="badge-wait">Menunggu LINGO</em>}
                                {row.updating && <em className="badge-wait">Password diperbarui</em>}
                                {row.removing && <em className="badge-remove">Akan dihapus</em>}
                            </span>
                            {!row.removing && (
                                <button type="button" className="wifi-remove" disabled={busy} onClick={() => handleRemove(row)}>
                                    {row.adding ? "Batal" : "Hapus"}
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <form className="wifi-add" onSubmit={handleAdd}>
                <label htmlFor={`wifi-ssid-${device.device_id}`}>Tambah WiFi</label>
                <input
                    id={`wifi-ssid-${device.device_id}`}
                    type="text"
                    placeholder="Nama WiFi (SSID), huruf besar/kecil harus sama"
                    value={ssid}
                    maxLength={32}
                    autoComplete="off"
                    onChange={(e) => setSsid(e.target.value)}
                />
                <div className="wifi-password">
                    <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password WiFi (kosongkan jika tanpa password)"
                        value={password}
                        maxLength={63}
                        autoComplete="new-password"
                        aria-label="Password WiFi"
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <button type="button" className="wifi-toggle" onClick={() => setShowPassword((v) => !v)}>
                        {showPassword ? "Sembunyikan" : "Lihat"}
                    </button>
                </div>
                {full && (
                    <p className="wifi-note">
                        LINGO menyimpan maksimal {device.max_saved} WiFi. WiFi yang paling lama tidak dipakai akan
                        tergeser jika menambah WiFi baru.
                    </p>
                )}
                <button type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Tambah WiFi"}</button>
            </form>

            {message.text && <p className={message.error ? "wifi-message error" : "wifi-message"}>{message.text}</p>}
        </div>
    );
}

export default function WifiCard({ userId }) {
    const [devices, setDevices] = useState(null);
    const [error, setError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const reload = useCallback(() => setReloadKey((k) => k + 1), []);

    useEffect(() => {
        let cancelled = false;
        API.get(`/users/${encodeURIComponent(userId)}/wifi`)
            .then((res) => { if (!cancelled) { setDevices(res.data); setError(""); } })
            .catch((e) => { if (!cancelled) setError(e.response?.data?.error || "Gagal memuat daftar WiFi."); });
        return () => { cancelled = true; };
    }, [userId, reloadKey]);

    return (
        <div className="profile-form-card wifi-card">
            <div className="wifi-card-head">
                <h2>WiFi LINGO</h2>
                <button type="button" className="wifi-refresh" onClick={reload}>Muat ulang</button>
            </div>
            <p className="form-description">
                Daftar WiFi yang bisa dipakai LINGO. LINGO otomatis memilih WiFi tersimpan dengan sinyal terkuat.
                Perubahan dikirim saat LINGO menyala dan terhubung internet (sekitar 2 menit, saat anak tidak
                sedang menekan tombol). Password tidak pernah ditampilkan lagi di sini.
            </p>

            {error && <p className="wifi-message error">{error}</p>}
            {!error && devices === null && <p className="wifi-empty">Memuat...</p>}
            {devices && devices.length === 0 && <p className="wifi-empty">Belum ada LINGO yang terpasang ke profil ini.</p>}
            {devices && devices.map((device) => (
                <DeviceWifi key={device.device_id} userId={userId} device={device} onChanged={reload} />
            ))}
        </div>
    );
}
