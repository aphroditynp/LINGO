import { useMemo } from "react";
const catalog = [
  {name:"Tantangan Bicara 1", page:14, total:4},
  {name:"Tantangan Bicara 2", page:16, total:12, pending:true},
  {name:"Misi Juara 1", page:18, total:2},
  {name:"Misi Juara 2", page:20, total:2},
  {name:"Mencocokkan Suku Kata", page:22, total:7}
];
export default function PageScoreBoard({sessions=[]}) {
  const latest = useMemo(() => {
    const map = {};
    for (const s of sessions) {
      const key = Number(s.page_number);
      if (!Number.isFinite(key) || !key) continue;
      if (!map[key] || new Date(s.date).getTime() > new Date(map[key].date).getTime()) map[key] = s;
    }
    return map;
  },[sessions]);
  return <section style={{marginTop:24,background:"white",borderRadius:18,padding:24,boxShadow:"0 4px 20px #0000000d"}}>
    <h3 style={{margin:"0 0 4px"}}>Penilaian per halaman</h3>
    <p style={{margin:"0 0 16px",color:"#637084",fontSize:14}}>Skor terakhir setiap halaman buku. Soal yang belum diperiksa tidak dihitung sebagai benar.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(215px,1fr))",gap:12}}>
      {catalog.map(p => {
        const s = latest[p.page];
        const pending = p.pending || s?.status === "pending_model";
        const assessed = !!s && !pending && s.accuracy != null;
        return <div key={p.page} style={{border:"1px solid #e6ebf3",borderRadius:12,padding:16}}>
          <div style={{fontSize:12,color:"#6b7280"}}>HALAMAN {p.page}</div>
          <div style={{fontWeight:700,margin:"5px 0"}}>{p.name}</div>
          <div style={{fontSize:24,fontWeight:800,color:pending?"#a06524":"#2279b6"}}>
            {pending ? "Belum dinilai" : assessed ? `${Math.round(Number(s.accuracy))}%` : "Belum ada sesi"}
          </div>
          <div style={{fontSize:12,color:"#5a6576"}}>
            {pending ? "Model pengenalan halaman ini belum tersedia" : assessed ? `${s.correct}/${p.total} benar • ${s.wrong} kesalahan • ${s.attempts ?? 0} percobaan` : `${p.total} tugas pada halaman ini`}
          </div>
        </div>;
      })}
    </div>
  </section>;
}
