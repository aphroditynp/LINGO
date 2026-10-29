"use strict";

const crypto = require("crypto");

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_SAVED_WIFI = 5;
// LINGO yang hidup melapor tiap ±1 menit (saat anak tidak menekan tombol).
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

// Daftar WiFi LINGO:
// - LINGO menyimpan maks. 5 WiFi (SSID + password) di memorinya sendiri dan
//   melaporkan SSID-nya (tanpa password) lewat /wifi/sync.
// - Orang tua menambah/menghapus WiFi dari dashboard. Perubahan disimpan
//   sebagai "wifi_pending" di dokumen device sampai LINGO mengonfirmasi
//   (ack_version), lalu password yang menunggu langsung dihapus dari server.
// - Kunci perangkat: dibuat LINGO sendiri, dicatat saat sync pertama
//   (trust on first use), wajib cocok di sync berikutnya.
function attachWifiRoutes({ app, db }) {
  const devices = db.collection("devices");
  const users = db.collection("users");
  const deviceKeys = db.collection("deviceKeys");

  const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
  const now = () => new Date().toISOString();

  const cleanSsid = (v) => (typeof v === "string" ? v : "");
  const validSsid = (v) => {
    const len = Buffer.byteLength(v, "utf8");
    return len >= 1 && len <= 32;
  };
  const validPassword = (v) => typeof v === "string" &&
    (v.length === 0 || (v.length >= 8 && v.length <= 63));

  async function checkDeviceKey(deviceId, key) {
    if (typeof key !== "string" || key.length < 32 || key.length > 128) return false;
    const ref = deviceKeys.doc(deviceId);
    const doc = await ref.get();
    if (!doc.exists) {
      await ref.set({ key_hash: sha256(key), created_at: now() });
      return true;
    }
    const expected = Buffer.from(doc.data().key_hash || "", "hex");
    const given = Buffer.from(sha256(key), "hex");
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  }

  function publicPending(pending) {
    return {
      pending_add: (pending?.add || []).map((item) => item.ssid),
      pending_remove: pending?.remove || [],
      // null = tidak ada perubahan; "" = kembali otomatis (sinyal terkuat).
      pending_prefer: typeof pending?.prefer === "string" ? pending.prefer : null,
    };
  }

  const isEmptyPending = (p) => p.add.length === 0 && p.remove.length === 0 && typeof p.prefer !== "string";

  function devicePayload(pending) {
    return pending
      ? { version: pending.version, add: pending.add || [], remove: pending.remove || [],
        prefer: typeof pending.prefer === "string" ? pending.prefer : null }
      : { version: 0, add: [], remove: [], prefer: null };
  }

  // LINGO -> server: laporkan WiFi, ambil perubahan dari orang tua.
  app.post("/api/devices/:deviceId/wifi/sync", async (req, res) => {
    const deviceId = req.params.deviceId;
    if (!DEVICE_ID_PATTERN.test(deviceId)) return res.status(400).json({ error: "Device ID tidak valid." });
    try {
      if (!await checkDeviceKey(deviceId, req.get("x-device-key"))) {
        return res.status(401).json({ error: "Kunci perangkat tidak cocok." });
      }
      const ref = devices.doc(deviceId);
      const doc = await ref.get();
      if (!doc.exists) return res.json(devicePayload(null));

      const body = req.body || {};
      const saved = Array.isArray(body.saved)
        ? body.saved.map(cleanSsid).filter(validSsid).slice(0, MAX_SAVED_WIFI)
        : [];
      let pending = doc.data().wifi_pending || null;
      if (pending && Number(body.ack_version) === pending.version) pending = null;

      await ref.update({
        wifi: {
          saved,
          connected_ssid: validSsid(cleanSsid(body.connected_ssid)) ? body.connected_ssid : null,
          rssi: Number.isFinite(body.rssi) ? body.rssi : null,
          preferred_ssid: validSsid(cleanSsid(body.preferred)) ? body.preferred : null,
          switch_failed: validSsid(cleanSsid(body.switch_failed)) ? body.switch_failed : null,
          state: body.state === "sleeping" ? "sleeping" : "awake",
          reported_at: now(),
        },
        wifi_pending: pending,
      });

      res.json(devicePayload(pending));
    } catch (error) {
      console.error("WIFI SYNC ERROR:", error);
      res.status(500).json({ error: "Gagal sinkron WiFi." });
    }
  });

  async function activeUser(userId) {
    if (!USER_ID_PATTERN.test(userId)) return false;
    const doc = await users.doc(userId).get();
    return doc.exists && doc.data().active !== false;
  }

  // Device milik anak ini, atau null.
  async function ownedDevice(userId, deviceId) {
    if (!DEVICE_ID_PATTERN.test(deviceId)) return null;
    const doc = await devices.doc(deviceId).get();
    return doc.exists && doc.data().user_id === userId ? doc : null;
  }

  // Orang tua: daftar WiFi semua LINGO milik anak.
  app.get("/api/users/:userId/wifi", async (req, res) => {
    try {
      if (!await activeUser(req.params.userId)) return res.status(404).json({ error: "Profil tidak ditemukan." });
      const paired = (await devices.where("user_id", "==", req.params.userId).get()).docs;
      res.json(paired.map((doc) => {
        const data = doc.data();
        const contacts = [data.wifi?.reported_at, data.last_seen_at].filter(Boolean).sort();
        return {
          device_id: data.device_id || doc.id,
          saved: data.wifi?.saved || [],
          connected_ssid: data.wifi?.connected_ssid || null,
          rssi: data.wifi?.rssi ?? null,
          reported_at: data.wifi?.reported_at || null,
          last_seen_at: data.last_seen_at || null,
          last_contact_at: contacts.length ? contacts[contacts.length - 1] : null,
          state: data.wifi?.state || null,
          preferred_ssid: data.wifi?.preferred_ssid || null,
          switch_failed: data.wifi?.switch_failed || null,
          online_window_ms: ONLINE_WINDOW_MS,
          max_saved: MAX_SAVED_WIFI,
          ...publicPending(data.wifi_pending),
        };
      }).sort((a, b) => a.device_id.localeCompare(b.device_id)));
    } catch (error) {
      console.error("GET WIFI ERROR:", error);
      res.status(500).json({ error: "Gagal mengambil daftar WiFi." });
    }
  });

  async function changePending(req, res, mutate) {
    const { userId, deviceId } = req.params;
    try {
      if (!await activeUser(userId)) return res.status(404).json({ error: "Profil tidak ditemukan." });
      const doc = await ownedDevice(userId, deviceId);
      if (!doc) return res.status(404).json({ error: "LINGO tidak ditemukan pada profil ini." });
      const current = doc.data().wifi_pending || { version: 0, add: [], remove: [] };
      const pending = {
        version: (current.version || 0) + 1,
        add: [...(current.add || [])],
        remove: [...(current.remove || [])],
        prefer: typeof current.prefer === "string" ? current.prefer : null,
        updated_at: now(),
      };
      const error = mutate(pending, doc.data());
      if (error) return res.status(400).json({ error });
      const empty = isEmptyPending(pending);
      await devices.doc(deviceId).update({ wifi_pending: empty ? null : pending });
      res.json({ status: "success", ...publicPending(empty ? null : pending) });
    } catch (error) {
      console.error("CHANGE WIFI ERROR:", error);
      res.status(500).json({ error: "Gagal menyimpan perubahan WiFi." });
    }
  }

  app.post("/api/users/:userId/devices/:deviceId/wifi", (req, res) => changePending(req, res, (pending) => {
    const ssid = cleanSsid(req.body?.ssid).trim();
    const password = req.body?.password ?? "";
    if (!validSsid(ssid)) return "Nama WiFi wajib diisi (maks. 32 karakter).";
    if (!validPassword(password)) return "Password WiFi harus 8-63 karakter, atau kosong untuk WiFi tanpa password.";
    pending.add = pending.add.filter((item) => item.ssid !== ssid);
    pending.add.push({ ssid, password });
    pending.remove = pending.remove.filter((s) => s !== ssid);
    return null;
  }));

  app.delete("/api/users/:userId/devices/:deviceId/wifi", (req, res) => changePending(req, res, (pending, data) => {
    const ssid = cleanSsid(req.query.ssid);
    if (!validSsid(ssid)) return "Nama WiFi tidak valid.";
    const wasPendingAdd = pending.add.some((item) => item.ssid === ssid);
    pending.add = pending.add.filter((item) => item.ssid !== ssid);
    // Batalkan tambahan yang belum terkirim, atau minta LINGO menghapusnya.
    if (!wasPendingAdd || (data.wifi?.saved || []).includes(ssid)) {
      if (!pending.remove.includes(ssid)) pending.remove.push(ssid);
    }
    if (pending.prefer === ssid) pending.prefer = data.wifi?.preferred_ssid === ssid ? "" : null;
    return null;
  }));

  // Pilih WiFi yang diutamakan LINGO. ssid "" = otomatis (sinyal terkuat).
  app.post("/api/users/:userId/devices/:deviceId/wifi/prefer", (req, res) => changePending(req, res, (pending, data) => {
    const ssid = cleanSsid(req.body?.ssid).trim();
    if (ssid) {
      const known = (data.wifi?.saved || []).includes(ssid) || pending.add.some((item) => item.ssid === ssid);
      if (!known || pending.remove.includes(ssid)) return "Pilih WiFi yang ada di daftar LINGO.";
    }
    // Sama dengan yang sudah dipakai LINGO: tidak perlu dikirim lagi.
    pending.prefer = ssid === (data.wifi?.preferred_ssid || "") ? null : ssid;
    return null;
  }));
}

module.exports = { attachWifiRoutes };
