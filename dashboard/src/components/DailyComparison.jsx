import { useEffect, useMemo, useState } from "react";
import {
  compareDays,
  gradedSessions,
  moduleOptions,
  shiftDateKey,
} from "./dailyComparisonUtils";
import "./DailyComparison.css";

const dateLabel = key => {
  if (!key) return "Belum dipilih";
  const date = new Date(`${key}T12:00:00Z`);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
};
const fmt = value => value == null ? "—" : `${Number(value.toFixed(1)).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
const fmtDelta = n => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("id-ID", { maximumFractionDigits: 1 })}`;

function DayCard({ side, date, value, onChange, summary }) {
  return (
    <div className="lingo-compare-day">
      <div className="lingo-compare-day-heading">
        <span className={`lingo-compare-dot ${side}`} aria-hidden="true" />
        <span>{side === "left" ? "Tanggal pembanding" : "Tanggal evaluasi"}</span>
      </div>
      <label className="lingo-compare-date-label" htmlFor={`lingo-date-${side}`}>Pilih tanggal</label>
      <input
        id={`lingo-date-${side}`}
        aria-label={side === "left" ? "Tanggal kiri" : "Tanggal kanan"}
        type="date"
        className="lingo-compare-date"
        value={value}
        onChange={event => onChange(event.target.value)}
      />
      <div className="lingo-compare-day-title">{dateLabel(date)}</div>
      <div className="lingo-compare-day-stat">
        <div><strong>{fmt(summary.average)}</strong><span>Rata-rata akurasi harian</span></div>
        <div><strong>{summary.count}</strong><span>Hasil modul</span></div>
      </div>
      <p className="lingo-compare-subtle">{summary.participants} peserta · {summary.modules} modul</p>
    </div>
  );
}

export default function DailyComparison({ sessions = [] }) {
  const allGraded = useMemo(() => gradedSessions(sessions), [sessions]);
  const availableDates = useMemo(() => [...new Set(allGraded.map(s => s._day))].sort(), [allGraded]);
  const options = useMemo(() => moduleOptions(sessions), [sessions]);
  const [leftDate, setLeftDate] = useState("");
  const [rightDate, setRightDate] = useState("");
  const [module, setModule] = useState("all");

  // Pilih dua tanggal terakhir yang memiliki sesi, tanpa menimpa pilihan manual pengguna.
  useEffect(() => {
    if (!availableDates.length) return;
    const last = availableDates.at(-1);
    const previous = availableDates.length > 1 ? availableDates.at(-2) : shiftDateKey(last, -1);
    setLeftDate(current => current || previous);
    setRightDate(current => current || last);
  }, [availableDates]);

  const result = useMemo(() => compareDays(sessions, leftDate, rightDate, module), [sessions, leftDate, rightDate, module]);
  const sameDate = Boolean(leftDate && rightDate && leftDate === rightDate);
  const bothHaveData = result.leftDaily.count > 0 && result.rightDaily.count > 0;
  const hasMatches = !sameDate && result.matches.length > 0;
  const trend = result.delta > 0.05 ? "naik" : result.delta < -0.05 ? "turun" : "tetap";
  const note = !bothHaveData
    ? "Salah satu tanggal belum mempunyai data penilaian. Pilih dua tanggal yang memiliki sesi."
    : sameDate
      ? "Pilih dua tanggal yang berbeda untuk melihat perubahan hasil belajar."
      : !hasMatches
        ? "Belum ada pasangan data yang setara: perlu peserta dan modul yang sama pada kedua hari. Nilai harian di atas masih dapat dilihat, tetapi belum menunjukkan perkembangan belajar."
        : null;
  const demo = result.leftDaily.hasDemo || result.rightDaily.hasDemo;

  return (
    <section className="lingo-compare" aria-label="Perbandingan hasil pembelajaran per tanggal">
      <div className="lingo-compare-header">
        <div>
          <span className="lingo-compare-eyebrow">MONITORING PEMBELAJARAN</span>
          <h2>Perbandingan Harian</h2>
          <p>Pilih dua tanggal untuk meninjau hasil dan melihat perubahan nilai pada tugas yang sebanding.</p>
        </div>
        <label className="lingo-compare-filter">Modul / halaman
          <select value={module} onChange={event => setModule(event.target.value)} aria-label="Filter modul perbandingan">
            <option value="all">Semua modul</option>
            {options.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
          </select>
        </label>
      </div>

      <div className="lingo-compare-sides">
        <DayCard side="left" date={leftDate} value={leftDate} onChange={setLeftDate} summary={result.leftDaily} />
        <DayCard side="right" date={rightDate} value={rightDate} onChange={setRightDate} summary={result.rightDaily} />
      </div>
      <div className="lingo-compare-actions">
        <button type="button" onClick={() => { setLeftDate(rightDate); setRightDate(leftDate); }} disabled={!leftDate || !rightDate}>
          ⇄ Tukar tanggal
        </button>
        <span>Waktu data: WIB (Asia/Jakarta). Sesi berulang pada hari yang sama memakai hasil terbaru.</span>
      </div>
      {demo && <p className="lingo-compare-warning">Beberapa sesi bertanda data simulasi. Jangan gunakan hasil ini sebagai bukti kemajuan anak yang sebenarnya.</p>}

      {note ? (
        <div className="lingo-compare-empty" role="status"><strong>Perbandingan belum tersedia</strong><p>{note}</p></div>
      ) : (
        <>
          <div className="lingo-compare-result">
            <div className="lingo-compare-result-main">
              <span className="lingo-compare-eyebrow">PERUBAHAN SKOR SETARA</span>
              <strong className={`lingo-compare-delta ${trend}`}>{fmtDelta(result.delta)} poin</strong>
              <span className="lingo-compare-trend">{trend === "naik" ? "Nilai meningkat" : trend === "turun" ? "Nilai menurun" : "Nilai tetap"}</span>
            </div>
            <div className="lingo-compare-result-stats">
              <div><span>Modul sebanding</span><strong>{result.matches.length}</strong></div>
              <div><span>Nilai awal → akhir</span><strong>{fmt(result.matchedLeft.average)} → {fmt(result.matchedRight.average)}</strong></div>
              <div><span>Jawaban benar</span><strong>{result.matchedLeft.correct} → {result.matchedRight.correct}</strong></div>
              <div><span>Percobaan salah</span><strong>{result.matchedLeft.wrong} → {result.matchedRight.wrong}</strong></div>
            </div>
          </div>

          <div className="lingo-compare-breakdown">
            <h3>Perbandingan per modul</h3>
            <p>Hanya modul yang dikerjakan oleh peserta yang sama pada kedua tanggal. Perubahan dihitung dalam poin persentase.</p>
            {result.matches.map(item => (
              <div className="lingo-compare-module" key={item.key}>
                <div className="lingo-compare-module-header">
                  <div><strong>{item.label}</strong>{item.page != null && <span>Halaman {item.page}</span>}</div>
                  <span className={item.delta > 0 ? "up" : item.delta < 0 ? "down" : "flat"}>{fmtDelta(item.delta)} poin</span>
                </div>
                <div className="lingo-compare-bar-row"><span>Kiri</span><div className="lingo-compare-bar-track"><div className="lingo-compare-bar left" style={{width: `${item.left._accuracy}%`}} /></div><b>{fmt(item.left._accuracy)}</b></div>
                <div className="lingo-compare-bar-row"><span>Kanan</span><div className="lingo-compare-bar-track"><div className="lingo-compare-bar right" style={{width: `${item.right._accuracy}%`}} /></div><b>{fmt(item.right._accuracy)}</b></div>
              </div>
            ))}
          </div>
          {(result.leftUnmatched > 0 || result.rightUnmatched > 0 || result.mismatchedQuestions > 0) && (
            <p className="lingo-compare-warning">Ada hasil yang tidak masuk perhitungan perkembangan: {result.leftUnmatched} di kiri dan {result.rightUnmatched} di kanan tidak memiliki pasangan setara. Pastikan peserta, modul, dan jumlah soal sama.</p>
          )}
        </>
      )}
      <p className="lingo-compare-footnote">Perkembangan dihitung dari rata-rata akurasi sesi terakhir untuk pasangan peserta dan modul yang sama; perbedaan dua kelompok murid tidak otomatis dianggap kemajuan belajar.</p>
    </section>
  );
}
