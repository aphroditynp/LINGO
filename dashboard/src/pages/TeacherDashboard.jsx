import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../api";
import "./TeacherDashboard.css";

function teacherConfig() {
  return { headers: { Authorization: `Bearer ${localStorage.getItem("lingoTeacherToken") || ""}` } };
}

const DAY_MS = 24 * 3600 * 1000;
const AVATAR_COLORS = ["#4F7CFF", "#2BA471", "#E58A1F", "#9B5DE5", "#E5484D", "#1F9EB8"];

function avatarColor(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function scoreTone(score) {
  if (score == null) return "none";
  if (score >= 80) return "good";
  if (score >= 60) return "medium";
  return "low";
}

function relativeDay(iso, now) {
  if (!iso) return "Belum pernah bermain";
  const days = Math.floor((now - new Date(iso).getTime()) / DAY_MS);
  if (days <= 0) return "Bermain hari ini";
  if (days === 1) return "Bermain kemarin";
  if (days < 30) return `Bermain ${days} hari lalu`;
  return `Bermain ${new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`;
}

// Murid yang perlu perhatian: nilai rata-rata < 60 atau tidak bermain > 7 hari.
function needsAttention(s, now) {
  const inactive = !s.last_activity || now - new Date(s.last_activity).getTime() > 7 * DAY_MS;
  return (s.average_accuracy != null && s.average_accuracy < 60) || (s.session_count > 0 && inactive);
}

const SORTS = {
  name: { label: "Nama", fn: (a, b) => (a.name || "").localeCompare(b.name || "") },
  low: { label: "Nilai terendah", fn: (a, b) => (a.average_accuracy ?? 101) - (b.average_accuracy ?? 101) },
  recent: { label: "Terakhir bermain", fn: (a, b) => (b.last_activity || "").localeCompare(a.last_activity || "") },
};

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [teacher, setTeacher] = useState(null);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Waktu acuan "hari ini" diambil sekali saat halaman dibuka.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!localStorage.getItem("lingoTeacherToken")) { navigate("/teacher/login", { replace: true }); return; }
    let cancelled = false;
    Promise.all([API.get("/teacher/me", teacherConfig()), API.get("/teacher/students", teacherConfig())])
      .then(([t, s]) => { if (!cancelled) { setTeacher(t.data); setStudents(s.data); } })
      .catch(e => {
        if (cancelled) return;
        if ([401, 403].includes(e.response?.status)) {
          localStorage.removeItem("lingoTeacherToken"); navigate("/teacher/login", { replace: true });
        } else setError(e.response?.data?.error || "Gagal memuat data murid.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [navigate]);

  const stats = useMemo(() => {
    const scored = students.filter(s => s.average_accuracy != null);
    const weekAgo = now - 7 * DAY_MS;
    return {
      average: scored.length ? Math.round(scored.reduce((n, s) => n + s.average_accuracy, 0) / scored.length) : null,
      activeWeek: students.filter(s => s.last_activity && new Date(s.last_activity).getTime() >= weekAgo).length,
      attention: students.filter(s => needsAttention(s, now)).length,
    };
  }, [students, now]);

  const visible = students
    .filter(s => `${s.name || ""} ${s.id}`.toLowerCase().includes(search.toLowerCase()))
    .sort(SORTS[sort].fn);

  const logout = () => { localStorage.removeItem("lingoTeacherToken"); navigate("/teacher/login"); };

  return <main className="container td-page">
    <section className="td-hero">
      <div>
        <span className="td-eyebrow">AKUN GURU · HANYA LIHAT</span>
        <h1>Halo, {teacher?.name || "Guru"}! 👋</h1>
        <p>Pantau perkembangan membaca murid-muridmu bersama LINGO.</p>
      </div>
      <button type="button" className="td-logout" onClick={logout}>Logout</button>
    </section>

    {error && <p className="td-error" role="alert">{error}</p>}

    {loading ? <div className="td-loading">Memuat data murid...</div> : <>
      <section className="td-stats" aria-label="Ringkasan kelas">
        <div className="td-stat"><span>Jumlah murid</span><strong>{students.length}</strong></div>
        <div className="td-stat">
          <span>Rata-rata nilai kelas</span>
          <strong className={`td-tone-${scoreTone(stats.average)}`}>{stats.average == null ? "–" : `${stats.average}%`}</strong>
        </div>
        <div className="td-stat"><span>Aktif 7 hari terakhir</span><strong>{stats.activeWeek}</strong></div>
        <div className={`td-stat ${stats.attention ? "td-stat-alert" : ""}`}>
          <span>Perlu perhatian</span><strong>{stats.attention}</strong>
        </div>
      </section>

      <section className="td-toolbar">
        <input
          type="search"
          placeholder="Cari nama atau ID murid"
          aria-label="Cari murid"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label>
          Urutkan
          <select value={sort} onChange={e => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </section>

      {students.length === 0 && <div className="td-empty">
        <strong>Belum ada murid</strong>
        <p>Hubungi admin LINGO untuk menautkan murid ke akunmu.</p>
      </div>}
      {students.length > 0 && visible.length === 0 && <div className="td-empty">
        <p>Tidak ada murid yang cocok dengan “{search}”.</p>
      </div>}

      <section className="td-grid">
        {visible.map(s => {
          const tone = scoreTone(s.average_accuracy);
          return <Link key={s.id} to={`/teacher/user/${encodeURIComponent(s.id)}`} className="td-card">
            <div className="td-card-top">
              <div className="td-avatar" style={{ background: avatarColor(s.id) }}>
                {(s.name || "M").trim().charAt(0).toUpperCase()}
              </div>
              <div className="td-card-name">
                <h3>{s.name || "Murid"}</h3>
                <span>{s.age ? `${s.age} tahun` : "Usia belum diisi"}</span>
              </div>
              {needsAttention(s, now) && <span className="td-badge">Perlu perhatian</span>}
            </div>

            <div className="td-score">
              <div className="td-score-label">
                <span>Rata-rata nilai</span>
                <strong className={`td-tone-${tone}`}>
                  {s.average_accuracy == null ? "Belum ada" : `${s.average_accuracy}%`}
                </strong>
              </div>
              <div className="td-bar">
                <div className={`td-bar-fill td-fill-${tone}`} style={{ width: `${s.average_accuracy ?? 0}%` }} />
              </div>
            </div>

            <div className="td-card-meta">
              <span>{s.session_count || 0} sesi</span>
              <span>{relativeDay(s.last_activity, now)}</span>
            </div>

            <span className="td-card-link">Lihat perkembangan →</span>
          </Link>;
        })}
      </section>
    </>}
  </main>;
}
