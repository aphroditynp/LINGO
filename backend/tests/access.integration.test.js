const assert = require("node:assert/strict");
const crypto = require("crypto");
const express = require("express");
const { attachAccessRoutes } = require("../access-routes");

const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const claimedCode = "a".repeat(64);
const availableCode = "b".repeat(64);
const collections = {
  users: new Map([["childA", { name: "Anak A", age: 6 }]]),
  deviceActivations: new Map([
    [sha256(claimedCode), { device_id: "LINGO001", status: "claimed", user_id: "childA" }],
    [sha256(availableCode), { device_id: "LINGO002", status: "available" }],
  ]),
  accessLinks: new Map(),
};
const db = { collection(name) {
  const data = collections[name];
  assert.ok(data, `unexpected collection ${name}`);
  return { doc: (id) => ({
    async get() { return { id, exists: data.has(id), data: () => data.get(id) }; },
    async create(value) { if (data.has(id)) throw new Error("already exists"); data.set(id, value); },
    async delete() { data.delete(id); },
  }),
  where(field, op, value) { return { async get() { return { docs: [...data.keys()]
    .filter((id) => data.get(id)[field] === value)
    .map((id) => ({ id, exists: true, data: () => data.get(id) })) }; } }; } };
} };

async function run() {
  const app = express(); app.use(express.json());
  attachAccessRoutes({ app, db, FRONTEND_URL: "https://dash.test" });
  const srv = app.listen(0, "127.0.0.1"); await new Promise((r) => srv.once("listening", r));
  const port = srv.address().port;
  async function hit(path, body) {
    const r = await fetch(`http://127.0.0.1:${port}/api${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  }
  try {
    let a = await hit("/devices/access", { code: claimedCode });
    assert.equal(a.status, 200); assert.deepEqual(a.data, { status: "claimed", user_id: "childA" });
    a = await hit("/devices/access", { code: availableCode });
    assert.equal(a.status, 200); assert.deepEqual(a.data, { status: "available" });
    a = await hit("/devices/access", { code: "c".repeat(64) }); assert.equal(a.status, 404);
    a = await hit("/devices/access", { code: "bukan-kode" }); assert.equal(a.status, 400);

    a = await hit("/access/share", { user_id: "tidakAda" }); assert.equal(a.status, 404);
    a = await hit("/access/share", { user_id: "childA" }); assert.equal(a.status, 201);
    const token = new URL(a.data.url).searchParams.get("token");
    assert.ok(a.data.url.startsWith("https://dash.test/akses?token="));
    assert.ok(!collections.accessLinks.has(token), "token mentah tidak boleh disimpan");

    a = await hit("/access/redeem", { token }); assert.equal(a.status, 200); assert.equal(a.data.user_id, "childA");
    a = await hit("/access/redeem", { token: "x".repeat(32) }); assert.equal(a.status, 404);
    a = await hit("/access/redeem", { token: "pendek" }); assert.equal(a.status, 400);
    // Cabut semua link: link lama tidak bisa dibuka lagi, QR tetap bisa.
    a = await hit("/access/share", { user_id: "childA" });
    const token2 = new URL(a.data.url).searchParams.get("token");
    a = await hit("/access/revoke", { user_id: "childA" });
    assert.equal(a.status, 200); assert.equal(a.data.revoked, 2);
    a = await hit("/access/redeem", { token }); assert.equal(a.status, 404);
    a = await hit("/access/redeem", { token: token2 }); assert.equal(a.status, 404);
    a = await hit("/devices/access", { code: claimedCode }); assert.equal(a.data.status, "claimed");
    a = await hit("/access/revoke", { user_id: "tidakAda" }); assert.equal(a.status, 404);
    console.log("access integration test: OK");
  } finally { srv.close(); }
}
run().catch((e) => { console.error(e); process.exit(1); });
