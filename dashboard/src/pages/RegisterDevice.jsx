import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import API from "../api";
import { setCurrentUserId } from "../user";

function RegisterDevice() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const code = searchParams.get("code") || "";

    const [name, setName] = useState("");
    const [age, setAge] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await API.post("/devices/register", {
                code,
                name,
                age: Number(age),
            });

            setCurrentUserId(response.data.user_id);
            navigate("/");
        } catch (requestError) {
            setError(
                requestError.response?.data?.error ||
                    "Pendaftaran gagal. Periksa koneksi lalu coba lagi."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="container device-register-page">
            <header className="device-register-header">
                <span>AKTIVASI PERANGKAT</span>
                <h1>Daftarkan LINGO</h1>
                <p>
                    Isi profil anak untuk memasangkan perangkat ini. Satu LINGO
                    hanya dapat didaftarkan satu kali.
                </p>
            </header>

            <section className="profile-form-card device-register-card">
                {code ? (
                    <>
                        <h2>Profil anak</h2>
                        <p className="form-description">
                            QR perangkat terdeteksi. Setelah pendaftaran
                            berhasil, LINGO ini akan terhubung ke profil anak.
                        </p>

                        <form onSubmit={handleSubmit}>
                            <label htmlFor="child-name">Nama anak</label>
                            <input
                                id="child-name"
                                type="text"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                autoComplete="given-name"
                                maxLength={80}
                                required
                            />

                            <label htmlFor="child-age">Umur (tahun)</label>
                            <input
                                id="child-age"
                                type="number"
                                min="1"
                                max="18"
                                step="1"
                                value={age}
                                onChange={(event) => setAge(event.target.value)}
                                required
                            />

                            {error && (
                                <p className="device-register-error" role="alert">
                                    {error}
                                </p>
                            )}

                            <button type="submit" disabled={loading}>
                                {loading ? "Mendaftarkan..." : "Daftarkan LINGO"}
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="device-register-error" role="alert">
                        Kode QR tidak ditemukan. Scan QR aktivasi yang ada pada
                        perangkat LINGO.
                    </div>
                )}
            </section>
        </main>
    );
}

export default RegisterDevice;