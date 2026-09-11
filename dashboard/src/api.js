import axios from "axios";

const API = axios.create({
    baseURL: "https://lingo-7ri9.onrender.com/api"
});

export default API;