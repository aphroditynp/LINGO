"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const express = require("express");

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const digest = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split(":");
  if (parts.length !== 2 || !/^[0-9a-f]{32}$/.test(parts[0]) || !/^[0-9a-f]{128}$/.test(parts[1])) return false;
  const expected = Buffer.from(parts[1], "hex");
  const actual = crypto.scryptSync(password, parts[0], 64);
  return crypto.timingSafeEqual(expected, actual);
}

function publicTeacher(id, data) {
  return {
    id,
    username: data.username,
    name: data.name,
    active: data.active !== false,
    assigned_user_ids: Array.isArray(data.assigned_user_ids) ? data.assigned_user_ids : [],
    created_at: data.created_at || null,
    updated_at: data.updated_at || null,
  };
}

function attachTeacherRoutes({ app, db, requireAdmin, JWT_SECRET }) {
  const router = express.Router();
  const teachers = db.collection("teachers");
  const users = db.collection("users");
  const sessions = db.collection("sessions");

  const failedLogins = new Map();
  function loginBlocked(key) {
    const now = Date.now();
    for (const [k, v] of failedLogins) if (v.until <= now) failedLogins.delete(k);
    return (failedLogins.get(key)?.count || 0) >= 8;
  }
  function recordFailedLogin(key) {
    const now = Date.now();
    const existing = failedLogins.get(key);
    const valid = existing && existing.until > now ? existing.count : 0;
    failedLogins.set(key, { count: valid + 1, until: now + 15 * 60 * 1000 });
  }

  async function requireTeacher(req, res, next) {
    try {
      if (!JWT_SECRET) return res.status(503).json({ error: "Konfigurasi autentikasi belum tersedia." });
      const match = /^Bearer (.+)$/.exec(req.get("Authorization") || "");
      if (!match) return res.status(401).json({ error: "Login guru diperlukan." });
      const decoded = jwt.verify(match[1], JWT_SECRET, { algorithms: ["HS256"] });
      if (decoded.role !== "teacher" || typeof decoded.teacher_id !== "string" ||
          !USERNAME_PATTERN.test(decoded.teacher_id)) {
        return res.status(403).json({ error: "Akun guru tidak memiliki izin." });
      }
      const snapshot = await teachers.doc(decoded.teacher_id).get();
      if (!snapshot.exists || snapshot.data().active === false) {
        return res.status(403).json({ error: "Akun guru tidak aktif." });
      }
      req.teacher = publicTeacher(snapshot.id, snapshot.data());
      return next();
    } catch (e) {
      return res.status(401).json({ error: "Sesi guru tidak valid atau kedaluwarsa." });
    }
  }

  function guardAssigned(req, res, next) {
    const id = req.params.userId;
    if (!USER_ID_PATTERN.test(id)) return res.status(400).json({ error: "ID murid tidak valid." });
    if (!req.teacher.assigned_user_ids.includes(id)) {
      return res.status(403).json({ error: "Guru tidak diberi akses ke ID murid ini." });
    }
    return next();
  }

  router.post("/teacher/login", async (req, res) => {
    try {
      const username = String(req.body?.username || "").trim().toLowerCase();
      const password = req.body?.password;
      if (!USERNAME_PATTERN.test(username) || typeof password !== "string" || password.length > 256) {
        return res.status(401).json({ error: "Username atau kata sandi salah." });
      }
      const throttleKey = `${req.ip}:${username}`;
      if (loginBlocked(throttleKey)) return res.status(429).json({ error: "Terlalu banyak percobaan. Coba kembali setelah 15 menit." });
      const doc = await teachers.doc(username).get();
      if (!doc.exists || doc.data().active === false || !verifyPassword(password, doc.data().password_hash)) {
        recordFailedLogin(throttleKey);
        return res.status(401).json({ error: "Username atau kata sandi salah." });
      }
      failedLogins.delete(throttleKey);
      return res.json({
        token: jwt.sign({ role: "teacher", teacher_id: username }, JWT_SECRET, { expiresIn: "8h", algorithm: "HS256" }),
        teacher: publicTeacher(doc.id, doc.data()),
      });
    } catch (error) {
      console.error("TEACHER LOGIN:", error.message);
      return res.status(500).json({ error: "Login gagal." });
    }
  });

  router.get("/teacher/me", requireTeacher, (req, res) => res.json(req.teacher));

  router.get("/teacher/students", requireTeacher, async (req, res) => {
    try {
      // Query hanya user_id yang telah diberikan oleh admin, tidak pernah seluruh koleksi.
      const studentDocs = await Promise.all(req.teacher.assigned_user_ids.map(id => users.doc(id).get()));
      const existing = studentDocs.filter(d => d.exists);
      // Ringkasan untuk kartu murid: jumlah sesi, rata-rata nilai, aktivitas terakhir.
      const summaries = await Promise.all(existing.map(async (d) => {
        const rows = (await sessions.where("user_id", "==", d.id).get()).docs.map(x => x.data());
        const graded = rows.filter(x => x.status !== "pending_model" && Number.isFinite(x.accuracy));
        const dates = rows.map(x => x.date).filter(Boolean).sort();
        return {
          session_count: rows.length,
          average_accuracy: graded.length
            ? Math.round(graded.reduce((sum, x) => sum + x.accuracy, 0) / graded.length)
            : null,
          last_activity: dates.length ? dates[dates.length - 1] : null,
        };
      }));
      return res.json(existing.map((d, i) => ({ id: d.id, ...d.data(), ...summaries[i] })));
    } catch (error) {
      console.error("TEACHER STUDENTS:", error.message);
      return res.status(500).json({ error: "Gagal mengambil data murid." });
    }
  });

  router.get("/teacher/students/:userId", requireTeacher, guardAssigned, async (req, res) => {
    try {
      const doc = await users.doc(req.params.userId).get();
      if (!doc.exists) return res.status(404).json({ error: "Murid tidak ditemukan." });
      return res.json({ id: doc.id, ...doc.data() });
    } catch (error) {
      return res.status(500).json({ error: "Gagal mengambil profil murid." });
    }
  });

  router.get("/teacher/students/:userId/sessions", requireTeacher, guardAssigned, async (req, res) => {
    try {
      const snapshot = await sessions.where("user_id", "==", req.params.userId).get();
      return res.json(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("TEACHER SESSIONS:", error.message);
      return res.status(500).json({ error: "Gagal mengambil riwayat murid." });
    }
  });

  // Semua operasi pengelolaan akun dan penetapan murid hanya untuk admin utama.
  router.get("/admin/teachers", requireAdmin, async (req, res) => {
    try {
      const snapshot = await teachers.get();
      return res.json(snapshot.docs.map(d => publicTeacher(d.id, d.data())));
    } catch (error) {
      return res.status(500).json({ error: "Gagal mengambil daftar guru." });
    }
  });

  router.post("/admin/teachers", requireAdmin, async (req, res) => {
    try {
      const username = String(req.body?.username || "").trim().toLowerCase();
      const name = String(req.body?.name || "").trim();
      const password = req.body?.password;
      if (!USERNAME_PATTERN.test(username) || !name || name.length > 80 ||
          typeof password !== "string" || password.length < 10 || password.length > 128) {
        return res.status(400).json({ error: "Username 3-32 karakter (a-z, angka, ._-), nama maksimal 80, kata sandi minimal 10 karakter." });
      }
      const now = new Date().toISOString();
      const teacherData = {
        username, name,
        password_hash: passwordHash(password),
        active: true,
        assigned_user_ids: [],
        created_at: now,
        updated_at: now,
      };
      await teachers.doc(username).create(teacherData);
      return res.status(201).json(publicTeacher(username, teacherData));
    } catch (error) {
      if (error.code === 6 || /already exists/i.test(error.message)) return res.status(409).json({ error: "Username guru sudah terdaftar." });
      console.error("CREATE TEACHER:", error.message);
      return res.status(500).json({ error: "Gagal membuat akun guru." });
    }
  });

  router.put("/admin/teachers/:teacherId/students", requireAdmin, async (req, res) => {
    try {
      const id = req.params.teacherId;
      const list = req.body?.user_ids;
      if (!USERNAME_PATTERN.test(id) || !Array.isArray(list) || list.length > 200 ||
          list.some(x => typeof x !== "string" || !USER_ID_PATTERN.test(x))) {
        return res.status(400).json({ error: "Daftar user_ids harus berisi ID murid valid (maksimal 200)." });
      }
      const userIds = [...new Set(list)];
      const teacherDoc = await teachers.doc(id).get();
      if (!teacherDoc.exists) return res.status(404).json({ error: "Guru tidak ditemukan." });
      const userDocs = await Promise.all(userIds.map(uid => users.doc(uid).get()));
      const missing = userIds.filter((_, i) => !userDocs[i].exists);
      if (missing.length) return res.status(400).json({ error: "ID murid belum terdaftar.", missing_user_ids: missing });
      await teachers.doc(id).update({ assigned_user_ids: userIds, updated_at: new Date().toISOString() });
      return res.json({ teacher_id: id, assigned_user_ids: userIds });
    } catch (error) {
      return res.status(500).json({ error: "Gagal menyimpan akses guru." });
    }
  });

  router.patch("/admin/teachers/:teacherId/status", requireAdmin, async (req, res) => {
    try {
      const id = req.params.teacherId;
      if (!USERNAME_PATTERN.test(id) || typeof req.body?.active !== "boolean") {
        return res.status(400).json({ error: "Status guru tidak valid." });
      }
      const doc = await teachers.doc(id).get();
      if (!doc.exists) return res.status(404).json({ error: "Guru tidak ditemukan." });
      await teachers.doc(id).update({ active: req.body.active, updated_at: new Date().toISOString() });
      return res.json({ teacher_id: id, active: req.body.active });
    } catch (error) {
      return res.status(500).json({ error: "Gagal memperbarui status guru." });
    }
  });

  router.post("/admin/teachers/:teacherId/reset-password", requireAdmin, async (req, res) => {
    try {
      const id = req.params.teacherId;
      const password = req.body?.password;
      if (!USERNAME_PATTERN.test(id) || typeof password !== "string" || password.length < 10 || password.length > 128) {
        return res.status(400).json({ error: "Password harus 10-128 karakter." });
      }
      const doc = await teachers.doc(id).get();
      if (!doc.exists) return res.status(404).json({ error: "Guru tidak ditemukan." });
      await teachers.doc(id).update({ password_hash: passwordHash(password), updated_at: new Date().toISOString() });
      return res.json({ message: "Kata sandi guru diperbarui." });
    } catch (error) {
      return res.status(500).json({ error: "Gagal memperbarui kata sandi." });
    }
  });

  app.use("/api", router);
}

module.exports = { attachTeacherRoutes };
