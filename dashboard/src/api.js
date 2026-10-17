import axios from "axios";
const API = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || "https://lingo-7ri9.onrender.com/api"
});
// Halaman guru memakai endpoint khusus dengan pengecekan penugasan di backend.
// Browser tidak memiliki izin mengubah profil melalui endpoint guru.
API.interceptors.request.use((config) => {
    const path = window.location.pathname;
    if (path.startsWith("/teacher/user/")) {
        const matched = /^\/(sessions|users)\/([^/?]+)$/.exec(config.url || "");
        if (matched && config.method?.toLowerCase() === "get") {
            const userId = encodeURIComponent(decodeURIComponent(matched[2]));
            config.url = matched[1] === "sessions"
                ? `/teacher/students/${userId}/sessions`
                : `/teacher/students/${userId}`;
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${localStorage.getItem("lingoTeacherToken") || ""}`;
        }
    }
    return config;
});

export default API;
