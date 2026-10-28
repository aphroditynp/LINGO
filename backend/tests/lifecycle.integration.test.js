const assert = require("node:assert/strict");
const crypto = require("crypto");
const express = require("express");
const { attachLifecycleRoutes } = require("../lifecycle-routes");
const { attachAccessRoutes } = require("../access-routes");

const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const code1 = "a".repeat(64);
const code2 = "b".repeat(64);
const collections = {
  users: new Map([["childA", { name: "Anak A", age: 6 }], ["childB", { name: "Anak B", age: 5 }]]),
  devices: new Map([
    ["LINGO001", { device_id: "LINGO001", user_id: "childA", paired_at: "2026-10-01T00:00:00.000Z" }],
    ["LINGO002", { device_id: "LINGO002", user_id: "childB", paired_at: "2026-10-01T00:00:00.000Z" }],
  ]),
  deviceActivations: new Map([
    [sha256(code1), { device_id: "LINGO001", status: "claimed", user_id: "childA", created_at: "2026-09-01" }],
    [sha256(code2), { device_id: "LINGO002", status: "claimed", user_id: "childB" }],
  ]),
  sessions: new Map([["s1", { user_id: "childB" }], ["s2", { user_id: "childA" }]]),
  accessLinks: new Map([["l1", { user_id: "childB" }]]),
  teachers: new Map([["t1", { assigned_user_ids: ["childA", "childB"] }]]),
};
const snap = (data, id) => ({ id, exists: data.has(id), data: () => data.get(id) });
const db = { collection(name) {
  const data = collections[name];
  assert.ok(data, `unexpected collection ${name}`);
  const all = () => [...data.keys()].map((id) => snap(data, id));
  return {
    doc: (id) => ({
      async get() { return snap(data, id); },
      async set(v) { data.set(id, v); },
      async update(v) { if (!data.has(id)) throw new Error("missing"); data.set(id, { ...data.get(id), ...v }); },
      async delete() { data.delete(id); },
    }),
    async get() { return { docs: all() }; },
    where(field, op, value) { return { async get() { return { docs: all().filter((d) => {
      const f = d.data()[field];
      return op === "array-contains" ? Array.isArray(f) && f.includes(value) : f === value;
    }) }; } }; },
  };
} };

async function run() {
  const app = express(); app.use(express.json());
  const requireAdmin = (req, res, next) => req.get("x-admin") ? next() : res.status(401).json({ error: "admin" });
  attachLifecycleRoutes({ app, db, requireAdmin, FRONTEND_URL: "https://dash.test" });
  attachAccessRoutes({ app, db, FRONTEND_URL: "https://dash.test" });
  const srv = app.listen(0, "127.0.0.1"); await new Promise((r) => srv.once("listening", r));
  const port = srv.address().port;
  async function hit(method, path, body, admin = true) {
    const r = await fetch(`http://127.0.0.1:${port}/api${path}`, { method,
      headers: { "content-type": "application/json", ...(admin ? { "x-admin": "1" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  }
  try {
    let a = await hit("POST", "/admin/devices/LINGO001/reset", undefined, false);
    assert.equal(a.status, 401);

    // Reset: QR yang sama kembali ke form aktivasi, profil lama nonaktif.
    a = await hit("POST", "/admin/devices/LINGO001/reset");
    assert.equal(a.status, 200); assert.equal(a.data.same_qr, true); assert.equal(a.data.previous_user_id, "childA");
    assert.equal(collections.devices.has("LINGO001"), false);
    assert.equal(collections.deviceActivations.get(sha256(code1)).status, "available");
    assert.equal(collections.deviceActivations.get(sha256(code1)).user_id, undefined);
    assert.equal(collections.users.get("childA").active, false);
    a = await hit("POST", "/devices/access", { code: code1 }, false);
    assert.deepEqual(a.data, { status: "available" });
    a = await hit("POST", "/access/share", { user_id: "childA" }, false);
    assert.equal(a.status, 404, "profil nonaktif tidak boleh dibagikan");

    // Daftar device tetap menampilkan LINGO yang belum dipasangkan.
    a = await hit("GET", "/admin/devices");
    assert.deepEqual(a.data.map((d) => [d.device_id, d.status]), [["LINGO001", "available"], ["LINGO002", "active"]]);

    // Aktifkan lagi profil: otomatis terpasang lagi di LINGO sebelumnya.
    a = await hit("POST", "/admin/users/childA/activate");
    assert.equal(a.status, 200); assert.equal(collections.users.get("childA").active, true);
    assert.deepEqual(a.data.restored_devices, ["LINGO001"]);
    assert.equal(collections.devices.get("LINGO001").user_id, "childA");
    assert.equal(collections.deviceActivations.get(sha256(code1)).status, "claimed");
    a = await hit("POST", "/devices/access", { code: code1 }, false);
    assert.deepEqual(a.data, { status: "claimed", user_id: "childA" });

    // Hapus LINGO: QR tidak berlaku lagi.
    a = await hit("DELETE", "/admin/devices/LINGO001");
    assert.equal(a.status, 200);
    assert.equal(collections.deviceActivations.has(sha256(code1)), false);
    a = await hit("POST", "/devices/access", { code: code1 }, false);
    assert.equal(a.status, 404);
    a = await hit("DELETE", "/admin/devices/LINGO001"); assert.equal(a.status, 404);

    // Orang tua menghapus profil: sesi, link, penugasan guru hilang; LINGO kembali awal.
    a = await hit("DELETE", "/users/childB", undefined, false);
    assert.equal(a.status, 200); assert.deepEqual(a.data.released_devices, ["LINGO002"]);
    assert.equal(collections.users.has("childB"), false);
    assert.equal(collections.sessions.has("s1"), false); assert.equal(collections.sessions.has("s2"), true);
    assert.equal(collections.accessLinks.has("l1"), false);
    assert.deepEqual(collections.teachers.get("t1").assigned_user_ids, ["childA"]);
    assert.equal(collections.devices.has("LINGO002"), false);
    assert.equal(collections.deviceActivations.get(sha256(code2)).status, "available");
    a = await hit("DELETE", "/users/childB", undefined, false); assert.equal(a.status, 404);

    // Nonaktifkan profil tanpa LINGO.
    a = await hit("POST", "/admin/users/childA/deactivate");
    assert.equal(a.status, 200); assert.equal(collections.users.get("childA").active, false);

    // Nonaktifkan lalu aktifkan lagi di LINGO yang sama.
    const code3 = "c".repeat(64);
    collections.users.set("childC", { name: "Anak C" });
    collections.devices.set("LINGO003", { device_id: "LINGO003", user_id: "childC", paired_at: "2026-10-01" });
    collections.deviceActivations.set(sha256(code3), { device_id: "LINGO003", status: "claimed", user_id: "childC" });
    a = await hit("POST", "/admin/users/childC/deactivate");
    assert.deepEqual(a.data.released_devices, ["LINGO003"]);
    assert.equal(collections.devices.has("LINGO003"), false);
    a = await hit("POST", "/admin/users/childC/deactivate"); // dua kali tetap ingat LINGO003
    assert.deepEqual(collections.users.get("childC").previous_device_ids, ["LINGO003"]);
    a = await hit("POST", "/admin/users/childC/activate");
    assert.deepEqual(a.data.restored_devices, ["LINGO003"]);
    assert.equal(collections.devices.get("LINGO003").user_id, "childC");
    a = await hit("POST", "/devices/access", { code: code3 }, false);
    assert.deepEqual(a.data, { status: "claimed", user_id: "childC" });

    // LINGO lama sudah dipakai anak lain: profil aktif tapi tidak dipasang.
    await hit("POST", "/admin/users/childC/deactivate");
    collections.devices.set("LINGO003", { device_id: "LINGO003", user_id: "childD", paired_at: "2026-10-02" });
    a = await hit("POST", "/admin/users/childC/activate");
    assert.equal(collections.users.get("childC").active, true);
    assert.deepEqual(a.data.restored_devices, []);
    assert.equal(a.data.skipped_devices[0].device_id, "LINGO003");
    assert.equal(collections.devices.get("LINGO003").user_id, "childD");
    console.log("lifecycle integration test: OK");
  } finally { srv.close(); }
}
run().catch((e) => { console.error(e); process.exit(1); });
