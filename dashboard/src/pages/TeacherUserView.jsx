import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import Dashboard from "./Dashboard";
import History from "./History";
import Report from "./Report";

export default function TeacherUserView() {
  const {userId} = useParams();
  const location = useLocation();
  if (!localStorage.getItem("lingoTeacherToken")) return <Navigate to="/teacher/login" replace />;
  const base = `/teacher/user/${encodeURIComponent(userId)}`;
  const isHistory = location.pathname.endsWith("/history");
  const isReport = location.pathname.endsWith("/report");
  return <main className="container">
    <div className="profile-header" style={{marginBottom:18}}>
      <span>AKSES GURU • READ ONLY</span>
      <h1>Perkembangan Murid</h1>
      <p>ID murid: <strong>{userId}</strong>. Hanya murid yang ditautkan admin yang dapat dibuka.</p>
    </div>
    <nav aria-label="Navigasi laporan murid" style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:20}}>
      <Link to="/teacher">← Daftar murid</Link>
      <Link to={base} aria-current={!isHistory&&!isReport?"page":undefined}>Dashboard</Link>
      <Link to={`${base}/history`} aria-current={isHistory?"page":undefined}>Riwayat</Link>
      <Link to={`${base}/report`} aria-current={isReport?"page":undefined}>Laporan</Link>
    </nav>
    {isHistory ? <History userIdOverride={userId} /> : isReport ? <Report userIdOverride={userId} /> : <Dashboard userIdOverride={userId} />}
  </main>;
}
