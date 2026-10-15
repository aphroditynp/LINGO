import axios from "axios";

const API = axios.create({
    baseURL: "https://lingo-7ri9.onrender.com/api"
});

API.interceptors.request.use((config) => {
    const token = localStorage.getItem("lingoAdminToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export default API;