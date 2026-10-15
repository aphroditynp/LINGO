import { useCallback, useEffect, useState } from "react";
import API from "../api";

function Admin() {
    const [token, setToken] = useState(() => localStorage.getItem("lingoAdminToken") || "");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await API.get("/admin/users");
            setUsers(response.data);
        } catch (requestError) {
            if (requestError.response?.status === 401) {
                localStorage.removeItem("lingoAdminToken");
                setToken("");
            }
            setError(requestError.response?.data?.error || "Daftar pengguna gagal dimuat.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!token) return undefined;
        const timer = window.setTimeout(() => loadUsers(), 0);
        return () => window.clearTimeout(timer);
    }, [token, loadUsers]);

    const handleLogin = async (event) => {
        event.preventDefault();
        setError("");
        try {
            const response = await API.post("/admin/login", { username, password });
            localStorage.setItem("lingoAdminToken", response.data.token);
            setToken(response.data.token);
            setPassword("");
        } catch (requestError) {
            setError(requestError.response?.data?.error || "Login administrator gagal.");
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("lingoAdminToken");
        setToken("");
        setUsers([]);
        setMessage("");
    };

    const handleResetUserId = async (user) => {
        if (!window.confirm(`Reset User ID untuk ${user.name || user.id}? ID dan pasangan perangkat akan diperbarui; riwayat belajar tetap dipertahankan.`)) return;
        setBusyId(user.id);
        setError("");
        setMessage("");
        try {
            const response = await API.post(`/admin/users/${encodeURIComponent(user.id)}/reset-id`);
            setMessage(`${response.data.message} ID baru: ${response.data.new_user_id}`);
            await loadUsers();
        } catch (requestError) {
            setError(requestError.response?.data?.error || "User ID gagal direset.");
        } finally {
            setBusyId("");
        }
    };

    const handleSaveDevice = async (event, user, originalDeviceId) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const deviceId = String(formData.get("device_id") || "").trim();
        const userId = String(formData.get("user_id") || "").trim();
        setBusyId(originalDeviceId);
        setError("");
        setMessage("");
        try {
            const response = await API.put(`/admin/devices/${encodeURIComponent(originalDeviceId)}`, {
                device_id: deviceId,
                user_id: userId,
            });
            setMessage(response.data.message);
            await loadUsers();
        } catch (requestError) {
            setError(requestError.response?.data?.error || "Perubahan ID gagal disimpan.");
        } finally {
            setBusyId("");
        }
    };

    if (!token) {
        return (
            <main className="container admin-page">
                <header className="admin-header">
                    <span>PENGELOLAAN LINGO</span>
                    <h1>Administrator</h1>
                    <p>Login administrator untuk mengatur LINGO ID dan User ID.</p>
                </header>
                <form className="admin-login-card" onSubmit={handleLogin}>
                    <h2>Login administrator</h2>
                    <label htmlFor="admin-username">Username</label>
                    <input id="admin-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
                    <label htmlFor="admin-password">Password</label>
                    <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                    {error && <p className="admin-error" role="alert">{error}</p>}
                    <button type="submit">Login</button>
                </form>
            </main>
        );
    }

    return (
        <main className="container admin-page">
            <header className="admin-header admin-title-row">
                <div>
                    <span>PENGELOLAAN LINGO</span>
                    <h1>Administrator</h1>
                    <p>Atur identitas perangkat LINGO dan profil pengguna.</p>
                </div>
                <button className="admin-secondary-button" type="button" onClick={handleLogout}>Keluar</button>
            </header>

            {error && <p className="admin-error" role="alert">{error}</p>}
            {message && <p className="admin-message" role="status">{message}</p>}

            <section className="admin-users-card">
                <div className="admin-section-heading">
                    <h2>Pengguna dan perangkat</h2>
                    <button className="admin-secondary-button" type="button" onClick={loadUsers} disabled={loading}>
                        {loading ? "Memuat..." : "Muat ulang"}
                    </button>
                </div>
                {loading && users.length === 0 ? <p>Memuat daftar pengguna...</p> : null}
                {!loading && users.length === 0 ? <p>Belum ada profil pengguna yang tersimpan.</p> : null}
                <div className="admin-user-list">
                    {users.map((user) => (
                        <article className="admin-user-card" key={user.id}>
                            <div className="admin-user-heading">
                                <div>
                                    <h3>{user.name || "Pengguna tanpa nama"}</h3>
                                    <p>User ID: <strong>{user.id}</strong>{user.age ? ` · ${user.age} tahun` : ""}</p>
                                </div>
                                <button type="button" className="admin-danger-button" onClick={() => handleResetUserId(user)} disabled={Boolean(busyId)}>
                                    {busyId === user.id ? "Memproses..." : "Reset User ID"}
                                </button>
                            </div>
                            {user.deviceIds.length === 0 ? <p className="admin-no-device">Belum ada LINGO yang terpasang.</p> : user.deviceIds.map((deviceId) => (
                                <form className="admin-device-form" key={deviceId} onSubmit={(event) => handleSaveDevice(event, user, deviceId)}>
                                    <label>LINGO ID
                                        <input name="device_id" defaultValue={deviceId} pattern="[A-Za-z0-9_-]{3,64}" title="3–64 karakter: huruf, angka, _ atau -" required />
                                    </label>
                                    <label>User ID pasangan
                                        <select name="user_id" defaultValue={user.id}>
                                            {users.map((option) => <option key={option.id} value={option.id}>{option.name || "Pengguna"} · {option.id}</option>)}
                                        </select>
                                    </label>
                                    <button type="submit" className="admin-secondary-button" disabled={Boolean(busyId)}>
                                        {busyId === deviceId ? "Menyimpan..." : "Simpan pasangan"}
                                    </button>
                                </form>
                            ))}
                        </article>
                    ))}
                </div>
            </section>
        </main>
    );
}

export default Admin;