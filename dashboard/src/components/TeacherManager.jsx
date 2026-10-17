import { useCallback, useEffect, useState } from "react";
import API from "../api";

const adminConfig = () => ({headers:{Authorization:`Bearer ${localStorage.getItem("lingoAdminToken")||""}`}});

export default function TeacherManager() {
  const [teachers,setTeachers] = useState([]);
  const [users,setUsers] = useState([]);
  const [error,setError] = useState("");
  const [info,setInfo] = useState("");
  const [name,setName] = useState("");
  const [username,setUsername] = useState("");
  const [password,setPassword] = useState("");
  const [selected,setSelected] = useState("");
  const [assignment,setAssignment] = useState([]);
  const [filter,setFilter] = useState("");
  const [newPassword,setNewPassword] = useState("");
  const [working,setWorking] = useState(false);

  const load = useCallback(async()=>{
    const [a,b] = await Promise.all([API.get("/admin/teachers",adminConfig()),API.get("/admin/users",adminConfig())]);
    setTeachers(a.data); setUsers(b.data);
    return a.data;
  },[]);
  useEffect(()=>{load().catch(e=>setError(e.response?.data?.error||"Gagal memuat daftar guru."));},[load]);

  function selectTeacher(id, list=teachers) {
    setSelected(id);
    setAssignment(list.find(t=>t.id===id)?.assigned_user_ids||[]);
  }
  async function create(e){
    e.preventDefault();setError("");setInfo("");setWorking(true);
    try {
      await API.post("/admin/teachers",{name,username,password},adminConfig());
      const list=await load();
      selectTeacher(username.toLowerCase(),list);
      setName("");setUsername("");setPassword("");
      setInfo("Akun guru berhasil dibuat. Berikan username dan kata sandi kepada guru melalui jalur privat.");
    } catch(e){setError(e.response?.data?.error||"Gagal membuat guru.");}
    finally{setWorking(false);}
  }
  async function saveAccess(){
    setError("");setInfo("");setWorking(true);
    try {
      await API.put(`/admin/teachers/${encodeURIComponent(selected)}/students`,{user_ids:assignment},adminConfig());
      const list=await load();selectTeacher(selected,list);
      setInfo("Daftar akses murid berhasil diperbarui.");
    } catch(e){setError(e.response?.data?.error||"Gagal menyimpan penugasan.");}
    finally{setWorking(false);}
  }
  async function toggleActive(){
    const teacher=teachers.find(t=>t.id===selected);
    if(!teacher) return;
    setWorking(true);setError("");setInfo("");
    try{
      await API.patch(`/admin/teachers/${encodeURIComponent(selected)}/status`,{active:!teacher.active},adminConfig());
      const list=await load();selectTeacher(selected,list);setInfo("Status guru diperbarui.");
    }catch(e){setError(e.response?.data?.error||"Gagal mengubah status.");}
    finally{setWorking(false);}
  }
  async function resetPassword(e){
    e.preventDefault();setWorking(true);setError("");setInfo("");
    try{
      await API.post(`/admin/teachers/${encodeURIComponent(selected)}/reset-password`,{password:newPassword},adminConfig());
      setNewPassword("");setInfo("Kata sandi baru sudah disimpan.");
    }catch(e){setError(e.response?.data?.error||"Gagal mengganti kata sandi.");}
    finally{setWorking(false);}
  }
  const teacher=teachers.find(t=>t.id===selected);
  return <section className="profile-form-card" style={{padding:24,margin:"25px 0"}}>
    <h2>Manajemen Akun Guru</h2>
    <p>Guru hanya dapat membaca data murid yang ID-nya dipilih oleh administrator di sini.</p>
    {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
    {info&&<p role="status" style={{color:"#166534"}}>{info}</p>}
    <form onSubmit={create} style={{display:"grid",gap:10,gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",alignItems:"end"}}>
      <div><label htmlFor="new-teacher-name">Nama guru</label><input id="new-teacher-name" value={name} onChange={e=>setName(e.target.value)} required maxLength={80}/></div>
      <div><label htmlFor="new-teacher-user">Username</label><input id="new-teacher-user" value={username} onChange={e=>setUsername(e.target.value)} required minLength={3} maxLength={32} pattern="[a-zA-Z0-9._-]+"/></div>
      <div><label htmlFor="new-teacher-pass">Password (min. 10)</label><input id="new-teacher-pass" type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={10} autoComplete="new-password"/></div>
      <button disabled={working}>Buat akun guru</button>
    </form>
    <hr style={{margin:"25px 0"}}/>
    <label htmlFor="teacher-select">Pilih guru untuk mengatur akses murid</label>
    <select id="teacher-select" value={selected} onChange={e=>selectTeacher(e.target.value)}>
      <option value="">-- Pilih guru --</option>
      {teachers.map(t=><option key={t.id} value={t.id}>{t.name} (@{t.username}) {t.active?"":"[nonaktif]"}</option>)}
    </select>
    {teacher&&<>
      <p style={{marginTop:18}}>Guru: <strong>{teacher.name}</strong> • {teacher.active?"Aktif":"Nonaktif"} • {assignment.length} murid dipilih</p>
      <input aria-label="Cari nama atau ID murid" placeholder="Cari nama atau ID murid" value={filter} onChange={e=>setFilter(e.target.value)} style={{width:"100%",maxWidth:480}}/>
      <div style={{border:"1px solid #ccc",padding:12,borderRadius:10,maxHeight:240,overflowY:"auto",margin:"12px 0"}}>
        {users.filter(u=>`${u.name||""} ${u.id}`.toLowerCase().includes(filter.toLowerCase())).map(u=><label key={u.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <input type="checkbox" checked={assignment.includes(u.id)} onChange={e=>setAssignment(prev=>e.target.checked?[...new Set([...prev,u.id])]:prev.filter(id=>id!==u.id))}/>
          <span>{u.name||"Murid"} <small>({u.id})</small></span>
        </label>)}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}>
        <button type="button" onClick={saveAccess} disabled={working}>Simpan daftar murid</button>
        <button type="button" onClick={toggleActive} disabled={working}>{teacher.active?"Nonaktifkan guru":"Aktifkan guru"}</button>
      </div>
      <form onSubmit={resetPassword} style={{display:"flex",flexWrap:"wrap",gap:10,marginTop:18}}>
        <input aria-label="Kata sandi baru guru" type="password" placeholder="Password baru (min. 10)" minLength={10} required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/>
        <button disabled={working}>Reset password guru</button>
      </form>
    </>}
  </section>;
}
