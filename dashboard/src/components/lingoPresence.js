export function relativeTime(iso, now = Date.now()) {
    if (!iso) return null;
    const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return "baru saja";
    if (minutes < 60) return `${minutes} menit lalu`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} jam lalu`;
    return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

// Status LINGO dari laporan terakhirnya (lihat backend/wifi-routes.js).
// LINGO yang hidup & online melapor tiap ±1 menit.
export function lingoPresence(device, now = Date.now()) {
    const last = device.last_contact_at;
    const seen = relativeTime(last, now);
    if (!last) {
        return { tone: "unknown", label: "Belum ada kabar", detail: "LINGO belum pernah melapor ke server." };
    }
    const recent = now - new Date(last).getTime() <= (device.online_window_ms || 300000);
    if (device.state === "sleeping") {
        return { tone: "sleep", label: "Istirahat", detail: `Masuk mode istirahat ${seen}. Tekan tombol mikrofon untuk membangunkan.` };
    }
    if (recent) {
        return { tone: "on", label: "Hidup", detail: device.connected_ssid ? `Online lewat ${device.connected_ssid}` : `Terakhir melapor ${seen}` };
    }
    return { tone: "off", label: "Tidak aktif", detail: `Mati atau tidak terhubung internet. Terakhir aktif ${seen}.` };
}
