import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API from "../api";
import { clearCurrentUserId } from "../user";

// Halaman orang tua yang memakai ID anak tersimpan di browser.
const PARENT_PATHS = ["/", "/history", "/report", "/profile"];

// Jika LINGO di-reset, profil dinonaktifkan, atau dihapus, lupakan ID anak
// di browser ini lalu arahkan orang tua untuk scan QR dan daftar ulang.
function ProfileStatusGuard() {
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        if (!PARENT_PATHS.includes(location.pathname)) return;

        let storedUserId;
        try {
            storedUserId = localStorage.getItem("lingoUserId");
        } catch {
            return;
        }
        if (!storedUserId) return;

        let cancelled = false;

        API.get(`/users/${encodeURIComponent(storedUserId)}`)
            .then((response) => {
                if (!cancelled && response.data.active === false) {
                    clearCurrentUserId();
                    navigate("/register-device?reset=1", { replace: true });
                }
            })
            .catch((error) => {
                if (!cancelled && error.response?.status === 404) {
                    clearCurrentUserId();
                    navigate("/register-device?reset=1", { replace: true });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [location.pathname, navigate]);

    return null;
}

export default ProfileStatusGuard;
