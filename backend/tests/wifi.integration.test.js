const assert = require("node:assert/strict");
const express = require("express");
const { attachWifiRoutes } = require("../wifi-routes");

const collections = {
  users: new Map([["childA", { name: "Anak A" }], ["childB", { name: "Anak B" }]]),
  devices: new Map([["LINGO001", { device_id: "LINGO001", user_id: "childA" }]]),
  deviceKeys: new Map(),
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
    }),
    where(field, op, value) { return { async get() { return { docs: all().filter((d) => d.data()[field] === value) }; } }; },
  };
} };

async function run() {
  const app = express(); app.use(express.json());
  attachWifiRoutes({ app, db });
  const srv = app.listen(0, "127.0.0.1"); await new Promise((r) => srv.once("listening", r));
  const port = srv.address().port;
  async function hit(method, path, body, key) {
    const r = await fetch(`http://127.0.0.1:${port}/api${path}`, { method,
      headers: { "content-type": "application/json", ...(key ? { "x-device-key": key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  }
  const key = "k".repeat(64);
  try {
    // Sync pertama mencatat kunci; kunci lain ditolak.
    let a = await hit("POST", "/devices/LINGO001/wifi/sync", { saved: ["Rumah", "HP Ibu"], connected_ssid: "Rumah", rssi: -55 }, key);
    assert.equal(a.status, 200); assert.deepEqual(a.data, { version: 0, add: [], remove: [], prefer: null });
    a = await hit("POST", "/devices/LINGO001/wifi/sync", { saved: [] }, "x".repeat(64));
    assert.equal(a.status, 401);
    a = await hit("POST", "/devices/LINGO001/wifi/sync", { saved: [] });
    assert.equal(a.status, 401);

    a = await hit("GET", "/users/childA/wifi");
    assert.equal(a.data.length, 1);
    assert.deepEqual(a.data[0].saved, ["Rumah", "HP Ibu"]);
    assert.equal(a.data[0].connected_ssid, "Rumah");

    // Validasi + kepemilikan.
    a = await hit("POST", "/users/childA/devices/LINGO001/wifi", { ssid: "Sekolah", password: "123" });
    assert.equal(a.status, 400);
    a = await hit("POST", "/users/childB/devices/LINGO001/wifi", { ssid: "Sekolah", password: "12345678" });
    assert.equal(a.status, 404);

    // Tambah & hapus.
    a = await hit("POST", "/users/childA/devices/LINGO001/wifi", { ssid: "Sekolah", password: "rahasia123" });
    assert.deepEqual(a.data.pending_add, ["Sekolah"]);
    assert.equal(JSON.stringify(a.data).includes("rahasia123"), false, "password tidak boleh dikirim ke dashboard");
    a = await hit("DELETE", "/users/childA/devices/LINGO001/wifi?ssid=HP%20Ibu");
    assert.deepEqual(a.data.pending_remove, ["HP Ibu"]);
    a = await hit("GET", "/users/childA/wifi");
    assert.equal(JSON.stringify(a.data).includes("rahasia123"), false);

    // Batalkan tambahan yang belum terkirim.
    await hit("POST", "/users/childA/devices/LINGO001/wifi", { ssid: "Salah", password: "" });
    a = await hit("DELETE", "/users/childA/devices/LINGO001/wifi?ssid=Salah");
    assert.deepEqual(a.data.pending_add, ["Sekolah"]); assert.deepEqual(a.data.pending_remove, ["HP Ibu"]);

    // LINGO mengambil perubahan, lalu konfirmasi -> password terhapus dari server.
    a = await hit("POST", "/devices/LINGO001/wifi/sync", { saved: ["Rumah", "HP Ibu"], connected_ssid: "Rumah" }, key);
    assert.deepEqual(a.data.add, [{ ssid: "Sekolah", password: "rahasia123" }]);
    assert.deepEqual(a.data.remove, ["HP Ibu"]);
    const version = a.data.version;
    a = await hit("POST", "/devices/LINGO001/wifi/sync", { saved: ["Sekolah", "Rumah"], connected_ssid: "Rumah", ack_version: version }, key);
    assert.deepEqual(a.data, { version: 0, add: [], remove: [], prefer: null });
    assert.equal(collections.devices.get("LINGO001").wifi_pending, null);
    a = await hit("GET", "/users/childA/wifi");
    assert.deepEqual(a.data[0].saved, ["Sekolah", "Rumah"]);
    assert.deepEqual(a.data[0].pending_add, []);

    // Ack versi lama tidak menghapus perubahan yang lebih baru.
    await hit("POST", "/users/childA/devices/LINGO001/wifi", { ssid: "Kafe", password: "" });
    a = await hit("POST", "/devices/LINGO001/wifi/sync", { saved: [], ack_version: version }, key);
    assert.deepEqual(a.data.add, [{ ssid: "Kafe", password: "" }]);

    // Pilih WiFi yang diutamakan.
    await hit("POST", "/devices/LINGO001/wifi/sync", { saved: ["Sekolah", "Rumah"], connected_ssid: "Rumah" }, key);
    a = await hit("POST", "/users/childA/devices/LINGO001/wifi/prefer", { ssid: "Tidak Ada" });
    assert.equal(a.status, 400);
    a = await hit("POST", "/users/childA/devices/LINGO001/wifi/prefer", { ssid: "Sekolah" });
    assert.equal(a.data.pending_prefer, "Sekolah");
    a = await hit("POST", "/devices/LINGO001/wifi/sync", { saved: ["Sekolah", "Rumah"], connected_ssid: "Rumah" }, key);
    assert.equal(a.data.prefer, "Sekolah");
    a = await hit("POST", "/devices/LINGO001/wifi/sync", { saved: ["Kafe", "Sekolah", "Rumah"], connected_ssid: "Sekolah",
      preferred: "Sekolah", ack_version: a.data.version }, key);
    assert.deepEqual(a.data, { version: 0, add: [], remove: [], prefer: null });
    a = await hit("GET", "/users/childA/wifi");
    assert.equal(a.data[0].preferred_ssid, "Sekolah"); assert.equal(a.data[0].pending_prefer, null);
    assert.equal(a.data[0].state, "awake"); assert.ok(a.data[0].last_contact_at);
    // Memilih yang sudah diutamakan tidak membuat perubahan; "" = otomatis.
    a = await hit("POST", "/users/childA/devices/LINGO001/wifi/prefer", { ssid: "Sekolah" });
    assert.equal(a.data.pending_prefer, null);
    a = await hit("POST", "/users/childA/devices/LINGO001/wifi/prefer", { ssid: "" });
    assert.equal(a.data.pending_prefer, "");
    // Laporan mode istirahat + gagal pindah.
    await hit("POST", "/devices/LINGO001/wifi/sync", { saved: ["Sekolah"], state: "sleeping", switch_failed: "Kafe" }, key);
    a = await hit("GET", "/users/childA/wifi");
    assert.equal(a.data[0].state, "sleeping"); assert.equal(a.data[0].switch_failed, "Kafe");

    // Profil nonaktif tidak bisa melihat / mengubah.
    collections.users.get("childA").active = false;
    a = await hit("GET", "/users/childA/wifi"); assert.equal(a.status, 404);
    console.log("wifi integration test: OK");
  } finally { srv.close(); }
}
run().catch((e) => { console.error(e); process.exit(1); });
