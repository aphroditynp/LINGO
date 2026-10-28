"use strict";

const crypto = require("crypto");

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

// Siklus hidup LINGO dan profil:
// - Reset LINGO   : lepas pasangan, QR yang SAMA kembali ke form aktivasi,
//                   profil lama dinonaktifkan (data tetap ada).
// - Hapus LINGO   : hapus perangkat dan seluruh QR-nya (QR tidak berlaku).
// - Nonaktifkan   : profil tidak bisa dibuka lewat QR/link; LINGO-nya dilepas.
// - Hapus profil  : (orang tua) hapus profil, sesi, dan link akses permanen.
function attachLifecycleRoutes({ app, db, requireAdmin, FRONTEND_URL }) {
  const devices = db.collection("devices");
  const activations = db.collection("deviceActivations");
  const users = db.collection("users");
  const sessions = db.collection("sessions");
  const accessLinks = db.collection("accessLinks");
  const teachers = db.collection("teachers");

  const now = () => new Date().toISOString();

  async function activationsOf(deviceId) {
    return (await activations.where("device_id", "==", deviceId).get()).docs;
  }

  // Kembalikan QR perangkat ke status awal dan hapus pasangannya.
  async function releaseDevice(deviceId) {
    const docs = await activationsOf(deviceId);
    for (const doc of docs) {
      const data = doc.data();
      if (data.status === "available") continue;
      await activations.doc(doc.id).set({
        device_id: deviceId,
        status: "available",
        created_at: data.created_at || null,
        reset_at: now(),
      });
    }
    await devices.doc(deviceId).delete();
    return docs.length;
  }

  async function releaseDevicesOfUser(userId) {
    const paired = (await devices.where("user_id", "==", userId).get()).docs;
    for (const doc of paired) await releaseDevice(doc.id);
    return paired.map((doc) => doc.id);
  }

  async function setUserActive(userId, active) {
    const ref = users.doc(userId);
    if (!(await ref.get()).exists) return false;
    await ref.update(active
      ? { active: true, reactivated_at: now() }
      : { active: false, deactivated_at: now() });
    return true;
  }

  function badDeviceId(req, res) {
    if (DEVICE_ID_PATTERN.test(req.params.deviceId)) return false;
    res.status(400).json({ error: "Device ID tidak valid." });
    return true;
  }

  function badUserId(req, res) {
    if (USER_ID_PATTERN.test(req.params.userId)) return false;
    res.status(400).json({ error: "User ID tidak valid." });
    return true;
  }

  // Daftar semua LINGO: yang sudah dipasangkan maupun yang QR-nya belum dipakai.
  app.get("/api/admin/devices", requireAdmin, async (req, res) => {
    try {
      const list = new Map();
      for (const doc of (await devices.get()).docs) {
        const device = doc.data();
        const userDoc = device.user_id ? await users.doc(device.user_id).get() : null;
        const user = userDoc && userDoc.exists ? userDoc.data() : null;
        list.set(doc.id, {
          device_id: device.device_id || doc.id,
          user_id: device.user_id || null,
          name: user?.name || "-",
          age: user?.age ?? null,
          paired_at: device.paired_at || null,
          status: "active",
        });
      }
      for (const doc of (await activations.get()).docs) {
        const deviceId = doc.data().device_id;
        if (typeof deviceId !== "string" || list.has(deviceId)) continue;
        list.set(deviceId, {
          device_id: deviceId, user_id: null, name: "-", age: null,
          paired_at: null, status: "available",
        });
      }
      res.json([...list.values()].sort((a, b) => a.device_id.localeCompare(b.device_id)));
    } catch (error) {
      console.error("ADMIN GET DEVICES ERROR:", error);
      res.status(500).json({ error: "Gagal mengambil data perangkat." });
    }
  });

  app.post("/api/admin/devices/:deviceId/reset", requireAdmin, async (req, res) => {
    if (badDeviceId(req, res)) return;
    const deviceId = req.params.deviceId;
    try {
      const deviceDoc = await devices.doc(deviceId).get();
      const previousUserId = deviceDoc.exists ? deviceDoc.data().user_id || null : null;
      const qrCount = await releaseDevice(deviceId);
      if (previousUserId) await setUserActive(previousUserId, false);

      let activationUrl = null;
      if (qrCount === 0) {
        // Perangkat lama tanpa catatan QR: buatkan QR baru.
        const code = crypto.randomBytes(32).toString("hex");
        await activations.doc(crypto.createHash("sha256").update(code).digest("hex")).set({
          device_id: deviceId, status: "available", created_at: now(), created_by: "admin",
        });
        activationUrl = `${FRONTEND_URL}/register-device?code=${code}`;
      } else if (!deviceDoc.exists) {
        return res.status(404).json({ error: "LINGO ini belum dipasangkan ke profil mana pun." });
      }

      console.log(`LINGO RESET: ${deviceId}`);
      res.json({
        status: "success",
        message: activationUrl
          ? "LINGO di-reset. QR lama tidak tercatat, pasang QR baru."
          : "LINGO di-reset. Scan QR yang sama untuk aktivasi ulang.",
        device_id: deviceId,
        previous_user_id: previousUserId,
        same_qr: !activationUrl,
        activation_url: activationUrl,
      });
    } catch (error) {
      console.error("ADMIN RESET ERROR:", error);
      res.status(500).json({ error: "Gagal melakukan reset LINGO." });
    }
  });

  app.delete("/api/admin/devices/:deviceId", requireAdmin, async (req, res) => {
    if (badDeviceId(req, res)) return;
    const deviceId = req.params.deviceId;
    try {
      const deviceDoc = await devices.doc(deviceId).get();
      const qrDocs = await activationsOf(deviceId);
      if (!deviceDoc.exists && qrDocs.length === 0) {
        return res.status(404).json({ error: "LINGO tidak ditemukan." });
      }
      const previousUserId = deviceDoc.exists ? deviceDoc.data().user_id || null : null;
      for (const doc of qrDocs) await activations.doc(doc.id).delete();
      await devices.doc(deviceId).delete();
      if (previousUserId) await setUserActive(previousUserId, false);
      console.log(`LINGO DELETED: ${deviceId}`);
      res.json({ status: "success", device_id: deviceId, previous_user_id: previousUserId });
    } catch (error) {
      console.error("ADMIN DELETE DEVICE ERROR:", error);
      res.status(500).json({ error: "Gagal menghapus LINGO." });
    }
  });

  app.post("/api/admin/users/:userId/deactivate", requireAdmin, async (req, res) => {
    if (badUserId(req, res)) return;
    try {
      if (!await setUserActive(req.params.userId, false)) {
        return res.status(404).json({ error: "Profil tidak ditemukan." });
      }
      const releasedDevices = await releaseDevicesOfUser(req.params.userId);
      res.json({ status: "success", active: false, released_devices: releasedDevices });
    } catch (error) {
      console.error("ADMIN DEACTIVATE USER ERROR:", error);
      res.status(500).json({ error: "Gagal menonaktifkan profil." });
    }
  });

  app.post("/api/admin/users/:userId/activate", requireAdmin, async (req, res) => {
    if (badUserId(req, res)) return;
    try {
      if (!await setUserActive(req.params.userId, true)) {
        return res.status(404).json({ error: "Profil tidak ditemukan." });
      }
      res.json({ status: "success", active: true });
    } catch (error) {
      console.error("ADMIN ACTIVATE USER ERROR:", error);
      res.status(500).json({ error: "Gagal mengaktifkan profil." });
    }
  });

  // Orang tua menghapus profil anaknya sendiri (permanen).
  app.delete("/api/users/:userId", async (req, res) => {
    if (badUserId(req, res)) return;
    const userId = req.params.userId;
    try {
      const userRef = users.doc(userId);
      if (!(await userRef.get()).exists) {
        return res.status(404).json({ error: "Profil tidak ditemukan." });
      }
      const releasedDevices = await releaseDevicesOfUser(userId);
      for (const collection of [sessions, accessLinks]) {
        for (const doc of (await collection.where("user_id", "==", userId).get()).docs) {
          await collection.doc(doc.id).delete();
        }
      }
      for (const doc of (await teachers.where("assigned_user_ids", "array-contains", userId).get()).docs) {
        const assigned = doc.data().assigned_user_ids || [];
        await teachers.doc(doc.id).update({ assigned_user_ids: assigned.filter((id) => id !== userId) });
      }
      await userRef.delete();
      console.log(`PROFILE DELETED: ${userId}`);
      res.json({ status: "success", released_devices: releasedDevices });
    } catch (error) {
      console.error("DELETE PROFILE ERROR:", error);
      res.status(500).json({ error: "Gagal menghapus profil. Silakan coba lagi." });
    }
  });
}

module.exports = { attachLifecycleRoutes };
