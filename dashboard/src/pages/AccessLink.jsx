import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import API from "../api";
import { setCurrentUserId } from "../user";

// Membuka dashboard anak dari link "Bagikan akses" di halaman Profil.
function AccessLink() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get("token") || "";
    const [error, setError] = useState(
        token ? "" : "Link akses tidak lengkap. Minta link baru dari keluarga."
    );

    useEffect(() => {
        if (!token) return;
        let cancelled = false;

        API.post("/access/redeem", { token })
            .then((response) => {
                if (cancelled) return;
                setCurrentUserId(response.data.user_id);
                navigate("/", { replace: true });
            })
            .catch((requestError) => {
                if (cancelled) return;
                setError(
                    requestError.response?.data?.error ||
                        "Gagal membuka link. Periksa koneksi lalu coba lagi."
                );
            });

        return () => {
            cancelled = true;
        };
    }, [token, navigate]);

    return (
        <main className="container device-register-page">
            <header className="device-register-header">
                <span>AKSES DASHBOARD</span>
                <h1>Buka Dashboard LINGO</h1>
            </header>

            <section className="profile-form-card device-register-card">
                {error ? (
                    <div className="device-register-error" role="alert">
                        {error}
                    </div>
                ) : (
                    <p className="form-description">Membuka dashboard anak...</p>
                )}
            </section>
        </main>
    );
}

export default AccessLink;
