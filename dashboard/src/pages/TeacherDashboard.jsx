import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../api";

function teacherConfig() {
  return { headers: { Authorization: `Bearer ${localStorage.getItem("lingoTeacherToken") || ""}` } };
}

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [teacher, setTeacher] = useState(null);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("lingoTeacherToken")) { navigate("/teacher/login", {replace:true}); return; }
    let cancelled = false;
    Promise.all([API.get("/teacher/me", teacherConfig()), API.get("/teacher/students", teacherConfig())])
      .then(([t,s]) => { if(!cancelled){ setTeacher(t.data); setStudents(s.data); } })
      .catch(e => {
        if(cancelled) return;
        if ([401,403].includes(e.response?.status)) {
          localStorage.removeItem("lingoTeacherToken"); navigate("/teacher/login", { replace:true });
        } else setError(e.response?.data?.error || "Gagal memuat data murid.");
      })
      .finally(()=>{ if(!cancelled) setLoading(false); });
    return ()=>{ cancelled = true; };
  }, [navigate]);

  const filtered = students.filter(s => `${s.name||""} ${s.id}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="container">
    <header className="profile-header" style={{marginBottom: 24}}>
      <span>AKUN GURU • READ ONLY</span>
      <h1>Monitoring Murid</h1>
      <p>{teacher ? `Guru: ${teacher.name}` : ""} • Daftar murid yang diberikan oleh admin</p>
    </header>
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:16}}>
      <strong>{students.length} murid terdaftar pada akun guru ini</strong>
      <button type="button" onClick={()=>{localStorage.removeItem("lingoTeacherToken");navigate("/teacher/login");}}>Logout</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {loading ? <p>Memuat data...</p> : <>
      <input placeholder="Cari nama / ID murid" aria-label="Cari murid" value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",maxWidth:440, marginBottom:20}}/>
      {students.length===0 && <p>Belum ada murid yang ditautkan. Hubungi admin LINGO untuk menambahkan ID murid.</p>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:16}}>
        {filtered.map(s=><article key={s.id} className="profile-form-card" style={{padding:20}}>
          <h3 style={{margin:"0 0 8px"}}>{s.name || "Murid"}</h3>
          <p>ID: <code>{s.id}</code></p>
          <p>Usia: {s.age ?? "-"} tahun</p>
          <Link to={`/teacher/user/${encodeURIComponent(s.id)}`}>Lihat perkembangan & laporan →</Link>
        </article>)}
      </div>
    </>}
  </main>;
}
