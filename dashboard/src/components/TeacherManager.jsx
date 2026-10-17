import { useCallback, useEffect, useMemo, useState } from "react";
import API from "../api";
import "./TeacherManager.css";

const adminConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("lingoAdminToken") || ""}` },
});

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  switch (name) {
    case "users": return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case "search": return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
    case "plus": return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case "check": return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
    case "shield": return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>;
    case "settings": return <svg {...common}><path d="M12 8v8M8 12h8"/><circle cx="12" cy="12" r="9"/></svg>;
    case "lock": return <svg {...common}><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>;
    case "refresh": return <svg {...common}><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12.5-3"/></svg>;
    default: return null;
  }
}

function explainRequestError(error, activity) {
  const status = error.response?.status;
  const detail = error.response?.data?.error;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (status === 404) return `Endpoint ${activity} belum tersedia (HTTP 404). Periksa deploy backend.`;
  if (status === 401) return "Sesi administrator berakhir. Silakan login kembali.";
  if (status === 403) return "Akses ditolak. Periksa hak akses administrator.";
  if (status === 409) return "Username ini sudah terdaftar.";
  if (status >= 500) return `Server bermasalah (HTTP ${status}). Periksa log backend.`;
  return status ? `${activity} gagal (HTTP ${status}).` : `Tidak dapat terhubung ke backend saat ${activity}.`;
}

const sameMembers = (a, b) => a.length === b.length && a.every((id) => b.includes(id));
const initial = (value) => (value || "G").trim().slice(0, 1).toUpperCase();

export default function TeacherManager() {
  const [teachers, setTeachers] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState("");
  const [assignment, setAssignment] = useState([]);
  const [filter, setFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    const [teachersResponse, usersResponse] = await Promise.all([
      API.get("/admin/teachers", adminConfig()),
      API.get("/admin/users", adminConfig()),
    ]);
    const teacherList = Array.isArray(teachersResponse.data) ? teachersResponse.data : [];
    const userList = Array.isArray(usersResponse.data) ? usersResponse.data : [];
    setTeachers(teacherList);
    setUsers(userList);
    return teacherList;
  }, []);

  useEffect(() => {
    let active = true;
    load().catch((e) => { if (active) setError(explainRequestError(e, "memuat data")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  const teacher = teachers.find((t) => t.id === selected);
  const originalAssignment = teacher?.assigned_user_ids || [];
  const hasUnsavedChanges = Boolean(teacher && !sameMembers(assignment, originalAssignment));
  const activeTeachers = teachers.filter((t) => t.active).length;
  const assignedStudentsCount = new Set(teachers.flatMap((t) => t.assigned_user_ids || [])).size;

  const filteredTeachers = useMemo(() => teachers.filter((t) =>
    `${t.name || ""} ${t.username || ""}`.toLowerCase().includes(teacherFilter.toLowerCase().trim())
  ).sort((a, b) => (a.name || "").localeCompare(b.name || "")), [teachers, teacherFilter]);

  const filteredUsers = useMemo(() => users.filter((u) =>
    `${u.name || ""} ${u.id || ""}`.toLowerCase().includes(filter.toLowerCase().trim())
  ).sort((a, b) => (a.name || a.id || "").localeCompare(b.name || b.id || "")), [users, filter]);

  function chooseTeacher(id, list = teachers, force = false) {
    if (!force && id !== selected && hasUnsavedChanges &&
        !window.confirm("Perubahan daftar murid belum disimpan. Pindah ke guru lain tanpa menyimpan?")) return;
    setSelected(id);
    setAssignment([...(list.find((t) => t.id === id)?.assigned_user_ids || [])]);
    setFilter("");
    setNewPassword("");
    setError("");
    setInfo("");
  }

  async function create(e) {
    e.preventDefault();
    setError(""); setInfo(""); setWorking(true);
    const normalizedUsername = username.trim().toLowerCase();
    try {
      await API.post("/admin/teachers", { name: name.trim(), username: normalizedUsername, password }, adminConfig());
      setPassword("");
      setInfo("Akun guru dibuat. Memuat daftar guru...");
      try {
        const list = await load();
        chooseTeacher(normalizedUsername, list, true);
        setName(""); setUsername(""); setShowCreate(false);
        setInfo("Akun guru berhasil dibuat. Bagikan kredensial melalui jalur privat.");
      } catch (refreshError) {
        setError(`Akun telah dibuat, tetapi daftar gagal dimuat. Jangan membuat ulang akun. ${explainRequestError(refreshError, "memuat guru")}`);
      }
    } catch (e2) {
      setError(explainRequestError(e2, "membuat guru"));
    } finally { setWorking(false); }
  }

  async function saveAccess() {
    if (!teacher || !hasUnsavedChanges) return;
    setError(""); setInfo(""); setWorking(true);
    try {
      await API.put(`/admin/teachers/${encodeURIComponent(selected)}/students`, { user_ids: assignment }, adminConfig());
      const list = await load();
      chooseTeacher(selected, list, true);
      setInfo("Akses murid berhasil disimpan.");
    } catch (e) { setError(explainRequestError(e, "menyimpan akses")); }
    finally { setWorking(false); }
  }

  async function toggleActive() {
    if (!teacher) return;
    const action = teacher.active ? "menonaktifkan" : "mengaktifkan";
    if (!window.confirm(`Yakin ingin ${action} akun ${teacher.name}?`)) return;
    setError(""); setInfo(""); setWorking(true);
    try {
      await API.patch(`/admin/teachers/${encodeURIComponent(selected)}/status`, { active: !teacher.active }, adminConfig());
      const list = await load();
      chooseTeacher(selected, list, true);
      setInfo(`Akun guru berhasil ${teacher.active ? "dinonaktifkan" : "diaktifkan"}.`);
    } catch (e) { setError(explainRequestError(e, "mengubah status")); }
    finally { setWorking(false); }
  }

  async function resetPassword(e) {
    e.preventDefault();
    setError(""); setInfo(""); setWorking(true);
    try {
      await API.post(`/admin/teachers/${encodeURIComponent(selected)}/reset-password`, { password: newPassword }, adminConfig());
      setNewPassword("");
      setInfo("Kata sandi guru berhasil diperbarui.");
    } catch (e2) { setError(explainRequestError(e2, "mengganti kata sandi")); }
    finally { setWorking(false); }
  }

  function toggleStudent(id) {
    setAssignment((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function selectFiltered() {
    setAssignment((prev) => [...new Set([...prev, ...filteredUsers.map((u) => u.id)])]);
  }

  function clearFiltered() {
    const filteredIds = new Set(filteredUsers.map((u) => u.id));
    setAssignment((prev) => prev.filter((id) => !filteredIds.has(id)));
  }

  return (
    <section className="tm-root" aria-labelledby="tm-title">
      <div className="tm-heading">
        <div className="tm-heading-copy">
          <span className="tm-eyebrow"><Icon name="shield" size={15}/> PENGELOLAAN AKSES</span>
          <h2 id="tm-title">Manajemen Akun Guru</h2>
          <p>Atur akun dan tentukan murid yang dapat dipantau oleh masing-masing guru.</p>
        </div>
        <button className={`tm-btn ${showCreate ? "tm-btn-ghost" : "tm-btn-primary"}`} type="button" onClick={() => setShowCreate((v) => !v)} aria-expanded={showCreate} aria-controls="tm-create-form">
          <Icon name="plus" size={17}/> {showCreate ? "Tutup formulir" : "Tambah guru"}
        </button>
      </div>

      <div className="tm-summary" aria-label="Ringkasan data">
        <div className="tm-summary-card"><span className="tm-summary-icon tm-indigo"><Icon name="users"/></span><div><strong>{teachers.length}</strong><span>Total guru</span></div></div>
        <div className="tm-summary-card"><span className="tm-summary-icon tm-green"><Icon name="check"/></span><div><strong>{activeTeachers}</strong><span>Guru aktif</span></div></div>
        <div className="tm-summary-card"><span className="tm-summary-icon tm-blue"><Icon name="shield"/></span><div><strong>{assignedStudentsCount}</strong><span>Murid dengan akses guru</span></div></div>
      </div>

      {error && <div className="tm-notice tm-notice-error" role="alert">{error}<button type="button" aria-label="Tutup pesan error" onClick={() => setError("")}>×</button></div>}
      {info && <div className="tm-notice tm-notice-success" role="status">{info}<button type="button" aria-label="Tutup notifikasi" onClick={() => setInfo("")}>×</button></div>}

      {showCreate && (
        <form className="tm-create" id="tm-create-form" onSubmit={create}>
          <div className="tm-section-heading"><div><h3>Buat akun guru</h3><p>Setelah dibuat, akun bisa ditautkan ke murid yang dipilih.</p></div></div>
          <div className="tm-create-grid">
            <label className="tm-field"><span>Nama lengkap guru</span><input type="text" placeholder="Contoh: Ibu Sari" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80}/></label>
            <label className="tm-field"><span>Username</span><input type="text" placeholder="contoh: bu.sari" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={32} pattern="[a-zA-Z0-9._-]+" autoComplete="off"/></label>
            <label className="tm-field"><span>Password <small>(minimal 10 karakter)</small></span><input type="password" placeholder="Buat password baru" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password"/></label>
            <button className="tm-btn tm-btn-primary tm-create-submit" type="submit" disabled={working}>{working ? "Memproses..." : "Buat akun"}</button>
          </div>
        </form>
      )}

      <div className="tm-workspace">
        <aside className="tm-pane tm-teachers" aria-label="Daftar guru">
          <div className="tm-pane-header"><div><h3>Daftar Guru</h3><p>Pilih guru untuk mengatur aksesnya</p></div><span className="tm-count">{teachers.length}</span></div>
          <label className="tm-search"><Icon name="search" size={18}/><input type="search" placeholder="Cari nama guru..." aria-label="Cari guru" value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}/></label>
          <div className="tm-teacher-list">
            {loading ? <p className="tm-empty">Memuat guru...</p> : filteredTeachers.length === 0 ? <div className="tm-empty">{teachers.length ? "Guru tidak ditemukan." : "Belum ada guru. Klik Tambah guru untuk membuat akun."}</div> : filteredTeachers.map((t) => (
              <button key={t.id} type="button" className={`tm-teacher-row ${selected === t.id ? "is-selected" : ""}`} onClick={() => chooseTeacher(t.id)} aria-pressed={selected === t.id}>
                <span className="tm-avatar">{initial(t.name)}</span>
                <span className="tm-teacher-text"><strong>{t.name || t.username}</strong><small>@{t.username} · {(t.assigned_user_ids || []).length} murid</small></span>
                <span className={`tm-status-dot ${t.active ? "is-active" : ""}`} title={t.active ? "Aktif" : "Nonaktif"} />
              </button>
            ))}
          </div>
        </aside>

        <div className="tm-pane tm-assignment">
          {!teacher ? (
            <div className="tm-select-placeholder">
              <div className="tm-placeholder-icon"><Icon name="users" size={28}/></div>
              <h3>Pilih guru terlebih dahulu</h3>
              <p>Daftar murid dan pengaturan akun guru akan tampil di bagian ini.</p>
            </div>
          ) : (
            <>
              <div className="tm-selected-heading">
                <div className="tm-selected-info"><span className="tm-avatar tm-avatar-lg">{initial(teacher.name)}</span><div><span className="tm-overline">AKSES MURID UNTUK</span><h3>{teacher.name}</h3><span className="tm-handle">@{teacher.username}</span></div></div>
                <span className={`tm-status-pill ${teacher.active ? "is-active" : ""}`}><span className={`tm-status-dot ${teacher.active ? "is-active" : ""}`}/>{teacher.active ? "Aktif" : "Nonaktif"}</span>
              </div>
              <div className="tm-assignment-bar"><span><strong>{assignment.length}</strong> murid dipilih</span>{hasUnsavedChanges ? <span className="tm-unsaved">Perubahan belum disimpan</span> : <span className="tm-saved"><Icon name="check" size={14}/> Tersimpan</span>}</div>
              <div className="tm-subtitle"><h4>Pilih murid yang dapat dipantau</h4><p>Guru hanya bisa melihat progres murid yang dicentang di sini.</p></div>
              <label className="tm-search tm-student-search"><Icon name="search" size={18}/><input type="search" placeholder="Cari nama atau ID murid..." aria-label="Cari nama atau ID murid" value={filter} onChange={(e) => setFilter(e.target.value)}/></label>
              <div className="tm-filter-actions"><span>{filteredUsers.length} murid ditampilkan</span><div><button type="button" className="tm-text-button" disabled={working || filteredUsers.length === 0} onClick={selectFiltered}>Pilih semua hasil</button><span aria-hidden="true">·</span><button type="button" className="tm-text-button" disabled={working || filteredUsers.length === 0} onClick={clearFiltered}>Hapus pilihan hasil</button></div></div>
              <div className="tm-student-list" role="group" aria-label="Daftar murid untuk diberi akses">
                {filteredUsers.length === 0 ? <div className="tm-empty">{users.length ? "Tidak ada murid yang cocok dengan pencarian." : "Belum ada murid terdaftar."}</div> : filteredUsers.map((u) => (
                  <label className={`tm-student-row ${assignment.includes(u.id) ? "is-checked" : ""}`} key={u.id}>
                    <input type="checkbox" checked={assignment.includes(u.id)} onChange={() => toggleStudent(u.id)} disabled={working}/>
                    <span className="tm-student-avatar">{initial(u.name || u.id)}</span>
                    <span className="tm-student-main"><strong>{u.name || "Murid"}</strong><small title={u.id}>ID: {u.id}</small></span>
                    {assignment.includes(u.id) && <span className="tm-access-tag"><Icon name="check" size={13}/> Diberi akses</span>}
                  </label>
                ))}
              </div>
              <div className="tm-save-row"><p>Perubahan hanya berlaku untuk guru ini.</p><button type="button" className="tm-btn tm-btn-primary" onClick={saveAccess} disabled={working || !hasUnsavedChanges}><Icon name="check" size={18}/>{working ? "Menyimpan..." : "Simpan akses murid"}</button></div>

              <details className="tm-advanced">
                <summary><span><Icon name="settings" size={18}/> Pengaturan akun guru</span><span className="tm-summary-hint">Password &amp; status akun</span></summary>
                <div className="tm-advanced-content">
                  <form className="tm-password-form" onSubmit={resetPassword}><label className="tm-field"><span>Atur ulang password</span><input type="password" placeholder="Password baru (min. 10 karakter)" minLength={10} required autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}/></label><button className="tm-btn tm-btn-outline" disabled={working} type="submit"><Icon name="lock" size={17}/> Reset password</button></form>
                  <div className="tm-danger-row"><div><strong>{teacher.active ? "Nonaktifkan akun" : "Aktifkan kembali akun"}</strong><p>{teacher.active ? "Guru tidak dapat login saat akunnya nonaktif." : "Guru dapat login lagi dan memantau murid yang ditugaskan."}</p></div><button type="button" className={`tm-btn ${teacher.active ? "tm-btn-danger" : "tm-btn-outline"}`} disabled={working} onClick={toggleActive}>{teacher.active ? "Nonaktifkan" : "Aktifkan"}</button></div>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
