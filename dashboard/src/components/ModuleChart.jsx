import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const order = [
  "Tantangan Bicara 1", "Tantangan Bicara 2",
  "Misi Juara 1", "Misi Juara 2", "Mencocokkan Suku Kata",
  // Data historis dengan format modul lama tetap didukung
  "Tantangan Bicara", "Misi Juara", "Mencocokan Suku Kata"
];
const colors = ["#48A7E6", "#357BC4", "#F8A36B", "#F07754", "#45C486"];
export default function ModuleChart({ sessions = [] }) {
  const {labels, values, fills} = useMemo(() => {
    const byModule = {};
    for (const row of sessions) {
      if (row.status === "pending_model" || row.accuracy == null) continue;
      const key = row.module || "Modul LINGO";
      if (!byModule[key]) byModule[key] = [];
      byModule[key].push(Number(row.accuracy));
    }
    const labels = [...order.filter(x => byModule[x]),
      ...Object.keys(byModule).filter(x => !order.includes(x)).sort()];
    return {
      labels,
      values: labels.map(x => Math.round(byModule[x].reduce((a,b) => a+b,0)/byModule[x].length)),
      fills: labels.map(x => colors[Math.max(0, order.indexOf(x)) % colors.length])
    };
  }, [sessions]);
  if (!labels.length) return null;
  const data = { labels, datasets: [{label:"Nilai (%)", data:values, backgroundColor:fills, borderRadius:8}]};
  return (
    <section style={{background:"#fff", borderRadius:18, padding:24, marginTop:24, boxShadow:"0 4px 20px #0000000d"}}>
      <h3 style={{margin:"0 0 16px"}}>Nilai per halaman LINGO</h3>
      <div style={{height:330}}>
        <Bar data={data} options={{responsive:true, maintainAspectRatio:false,
          plugins:{legend:{display:false}}, scales:{y:{min:0,max:100,ticks:{callback:v=>`${v}%`}}}}} />
      </div>
    </section>
  );
}
