"use strict";

const crypto = require("crypto");

const ACTIVATION_CODE_PATTERN = /^[a-f0-9]{64}$/i;
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Akses dashboard dari perangkat lain tanpa akun:
// 1. scan ulang QR LINGO yang sudah terdaftar -> langsung masuk;
// 2. link bagikan dari halaman Profil (token disimpan sebagai hash).
function attachAccessRoutes({ app, db, FRONTEND_URL }) {
  const activations = db.collection("deviceActivations");
  const users = db.collection("users");
  const accessLinks = db.collection("accessLinks");

  // Profil yang dinonaktifkan admin tidak bisa dibuka lewat QR atau link.
  async function userExists(userId) {
    if (typeof userId !== "string" || !USER_ID_PATTERN.test(userId)) return false;
    const doc = await users.doc(userId).get();
    return doc.exists && doc.data().active !== false;
  }

  app.post("/api/devices/access", async (req, res) => {
    const code = typeof req.body.code === "string" ? req.body.code.trim() : "";
    if (!ACTIVATION_CODE_PATTERN.test(code)) {
      return res.status(400).json({ error: "Kode QR tidak valid. Scan QR pada perangkat LINGO." });
    }
    try {
      const snapshot = await activations.doc(sha256(code)).get();
      if (!snapshot.exists) {
        return res.status(404).json({ error: "QR tidak dikenal atau sudah tidak berlaku." });
      }
      const activation = snapshot.data();
      if (activation.status === "available") return res.json({ status: "available" });
      if (activation.status === "claimed" && await userExists(activation.user_id)) {
        return res.json({ status: "claimed", user_id: activation.user_id });
      }
      return res.status(409).json({ error: "QR ini sudah tidak aktif. Hubungi admin LINGO." });
    } catch (error) {
      console.error("DEVICE ACCESS ERROR:", error);
      return res.status(500).json({ error: "Gagal memeriksa QR. Silakan coba lagi." });
    }
  });

  app.post("/api/access/share", async (req, res) => {
    const userId = req.body.user_id;
    try {
      if (!await userExists(userId)) {
        return res.status(404).json({ error: "Profil anak tidak ditemukan." });
      }
      const token = crypto.randomBytes(24).toString("base64url");
      await accessLinks.doc(sha256(token)).create({
        user_id: userId,
        created_at: new Date().toISOString(),
      });
      return res.status(201).json({ url: `${FRONTEND_URL}/akses?token=${token}` });
    } catch (error) {
      console.error("ACCESS SHARE ERROR:", error);
      return res.status(500).json({ error: "Gagal membuat link. Silakan coba lagi." });
    }
  });

  // Cabut semua link bagikan milik profil ini (QR pada LINGO tetap berlaku).
  app.post("/api/access/revoke", async (req, res) => {
    const userId = req.body.user_id;
    try {
      if (!await userExists(userId)) {
        return res.status(404).json({ error: "Profil anak tidak ditemukan." });
      }
      const links = (await accessLinks.where("user_id", "==", userId).get()).docs;
      for (const doc of links) await accessLinks.doc(doc.id).delete();
      return res.json({ status: "success", revoked: links.length });
    } catch (error) {
      console.error("ACCESS REVOKE ERROR:", error);
      return res.status(500).json({ error: "Gagal mencabut link. Silakan coba lagi." });
    }
  });

  app.post("/api/access/redeem", async (req, res) => {
    const token = typeof req.body.token === "string" ? req.body.token.trim() : "";
    if (!SHARE_TOKEN_PATTERN.test(token)) {
      return res.status(400).json({ error: "Link akses tidak valid." });
    }
    try {
      const snapshot = await accessLinks.doc(sha256(token)).get();
      const userId = snapshot.exists ? snapshot.data().user_id : null;
      if (!await userExists(userId)) {
        return res.status(404).json({ error: "Link akses tidak dikenal atau sudah tidak berlaku." });
      }
      return res.json({ user_id: userId });
    } catch (error) {
      console.error("ACCESS REDEEM ERROR:", error);
      return res.status(500).json({ error: "Gagal membuka link. Silakan coba lagi." });
    }
  });
}

module.exports = { attachAccessRoutes };
