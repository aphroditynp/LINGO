import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../api";

export default function TeacherLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event) {
    event.preventDefault();
    setError(""); setLoading(true);
    try {
      const { data } = await API.post("/teacher/login", { username, password });
      localStorage.setItem("lingoTeacherToken", data.token);
      navigate("/teacher", { replace: true });
    } catch (e) {
      setError(e.response?.data?.error || "Tidak dapat login. Periksa koneksi.");
    } finally { setLoading(false); }
  }

  return <main className="container">
    <section className="profile-form-card" style={{ maxWidth: 520, margin: "70px auto", padding: 26 }}>
      <header className="profile-header">
        <span>LINGO UNTUK GURU</span>
        <h1>Login Guru</h1>
        <p>Masuk untuk melihat perkembangan murid yang telah ditautkan oleh administrator.</p>
      </header>
      <form onSubmit={login}>
        <label htmlFor="teacher-username">Username Guru</label>
        <input id="teacher-username" required autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} />
        <label htmlFor="teacher-password">Kata sandi</label>
        <input id="teacher-password" required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} />
        {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
        <button type="submit" disabled={loading}>{loading ? "Memeriksa..." : "Masuk sebagai Guru"}</button>
      </form>
      <p style={{marginTop: 16, fontSize: 14}}>Akun guru dibuat oleh admin LINGO. <Link to="/admin/login">Login admin utama</Link></p>
    </section>
  </main>;
}
