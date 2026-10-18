// Fungsi murni agar perbandingan harian dapat diuji tanpa browser/Firebase.
const TZ = "Asia/Jakarta";
const dayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
});

export function sessionDateKey(rawDate) {
  if (rawDate == null) return null;
  // Firestore date-only tidak boleh digeser timezone.
  if (typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
  let value = rawDate;
  if (typeof rawDate === "object") {
    const seconds = rawDate.seconds ?? rawDate._seconds;
    if (typeof seconds === "number") value = seconds * 1000;
    else if (typeof rawDate.toDate === "function") value = rawDate.toDate();
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(dayFormatter.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function localToday() { return sessionDateKey(new Date()); }

export function moduleKey(session) {
  if (session.module_id) return String(session.module_id);
  if (session.page_number != null && session.page_number !== "") return `page_${session.page_number}`;
  return session.module ? `name_${String(session.module).trim()}` : "";
}

function participantKey(session) {
  // `participant_code` penting untuk dataset demo yang memakai user_id seragam.
  return String(session.participant_code || session.user_id || "akun_tanpa_id");
}

function timestampMs(value) {
  if (value && typeof value === "object") {
    const seconds = value.seconds ?? value._seconds;
    if (typeof seconds === "number") return seconds * 1000;
  }
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function numeric(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function gradedSessions(sessions) {
  return (Array.isArray(sessions) ? sessions : [])
    .filter(s => s && s.status !== "pending_model" && s.status !== "ungraded")
    .map(s => ({ ...s, _day: sessionDateKey(s.date), _module: moduleKey(s), _accuracy: numeric(s.accuracy) }))
    .filter(s => s._day && s._module && s._accuracy != null && s._accuracy >= 0 && s._accuracy <= 100);
}

// Jika ada beberapa sesi peserta+modul pada tanggal yang sama, gunakan sesi TERAKHIR.
export function latestSessionsOnDay(graded, day, selectedModule = "all") {
  const byTask = new Map();
  for (const s of graded) {
    if (s._day !== day || (selectedModule !== "all" && s._module !== selectedModule)) continue;
    const key = `${participantKey(s)}::${s._module}`;
    const old = byTask.get(key);
    if (!old || timestampMs(s.date) >= timestampMs(old.date)) byTask.set(key, s);
  }
  return byTask;
}

function aggregate(sessions) {
  const items = Array.from(sessions);
  const sum = field => items.reduce((acc, s) => acc + (numeric(s[field]) ?? 0), 0);
  const mean = items.length ? items.reduce((acc, s) => acc + s._accuracy, 0) / items.length : null;
  return {
    count: items.length,
    participants: new Set(items.map(participantKey)).size,
    modules: new Set(items.map(s => s._module)).size,
    average: mean,
    correct: sum("correct"),
    wrong: sum("wrong"),
    attempts: sum("attempts"),
    hasDemo: items.some(s => s.is_demo === true),
  };
}

export function compareDays(sessions, dayA, dayB, selectedModule = "all") {
  const graded = gradedSessions(sessions);
  const left = latestSessionsOnDay(graded, dayA, selectedModule);
  const right = latestSessionsOnDay(graded, dayB, selectedModule);
  const matching = [];
  let mismatchedQuestions = 0;
  for (const [key, a] of left) {
    const b = right.get(key);
    if (!b) continue;
    const qa = numeric(a.total_question);
    const qb = numeric(b.total_question);
    // Dengan total soal yang diketahui dan berbeda, datanya tidak sebanding.
    if ((qa != null || qb != null) && (qa == null || qb == null || qa !== qb)) {
      mismatchedQuestions++;
      continue;
    }
    matching.push({
      key,
      label: a.module || b.module || a._module,
      page: a.page_number ?? b.page_number ?? null,
      left: a,
      right: b,
      delta: b._accuracy - a._accuracy,
    });
  }
  matching.sort((a, b) => (Number(a.page) || 999) - (Number(b.page) || 999) || a.label.localeCompare(b.label));
  const matchedLeft = aggregate(matching.map(x => x.left));
  const matchedRight = aggregate(matching.map(x => x.right));
  return {
    leftDaily: aggregate(left.values()),
    rightDaily: aggregate(right.values()),
    matchedLeft,
    matchedRight,
    matches: matching,
    delta: matching.length ? matchedRight.average - matchedLeft.average : null,
    mismatchedQuestions,
    leftUnmatched: left.size - matching.length,
    rightUnmatched: right.size - matching.length,
  };
}

export function moduleOptions(sessions) {
  const options = new Map();
  for (const s of gradedSessions(sessions)) {
    options.set(s._module, { key: s._module, label: s.module || `Halaman ${s.page_number || "?"}` });
  }
  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label, "id"));
}
