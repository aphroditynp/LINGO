const assert = require("node:assert/strict");
const crypto = require("crypto");
const test = require("node:test");
const { buildActivation, buildRegistrationUrl } = require("./create-device-qr");

test("registration URL points to device enrollment and carries the code", () => {
    assert.equal(
        buildRegistrationUrl("https://lingo.example/nested/path", "activation-code"),
        "https://lingo.example/register-device?code=activation-code"
    );
});

test("activation stores only the SHA-256 code hash and an available device", () => {
    const code = "example-one-time-code";
    const { codeHash, activation } = buildActivation(code, "LINGO002");

    assert.equal(codeHash, crypto.createHash("sha256").update(code).digest("hex"));
    assert.notEqual(codeHash, code);
    assert.deepEqual(activation, {
        device_id: "LINGO002",
        status: "available",
    });
});