const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
require("dotenv").config();

const db = require("./firebase");

const app = express();
const adminLoginAttempts = new Map();


// =================================
// MIDDLEWARE
// =================================

app.use(cors());

app.use(express.json());


function hashActivationCode(code) {

    return crypto
        .createHash("sha256")
        .update(code)
        .digest("hex");

}

function adminConfigurationIsReady() {
    return Boolean(
        process.env.ADMIN_USERNAME &&
        process.env.ADMIN_PASSWORD &&
        process.env.ADMIN_TOKEN_SECRET &&
        process.env.ADMIN_TOKEN_SECRET.length >= 32
    );
}

function createAdminToken(username) {
    const payload = Buffer.from(JSON.stringify({
        username,
        expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    })).toString("base64url");
    const signature = crypto
        .createHmac("sha256", process.env.ADMIN_TOKEN_SECRET)
        .update(payload)
        .digest("base64url");

    return `${payload}.${signature}`;
}

function requireAdmin(req, res, next) {
    if (!adminConfigurationIsReady()) {
        return res.status(503).json({ error: "Login administrator belum dikonfigurasi." });
    }

    const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
    const [payload, signature] = token?.split(".") || [];

    if (!payload || !signature) {
        return res.status(401).json({ error: "Login administrator diperlukan." });
    }

    const expectedSignature = crypto
        .createHmac("sha256", process.env.ADMIN_TOKEN_SECRET)
        .update(payload)
        .digest("base64url");
    const supplied = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        return res.status(401).json({ error: "Sesi administrator tidak valid." });
    }

    try {
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (claims.username !== process.env.ADMIN_USERNAME || claims.expiresAt <= Date.now()) {
            return res.status(401).json({ error: "Sesi administrator sudah berakhir." });
        }
    } catch {
        return res.status(401).json({ error: "Sesi administrator tidak valid." });
    }

    next();
}

async function updateSnapshotsInBatches(snapshots, updates) {
    for (let index = 0; index < snapshots.length; index += 450) {
        const batch = db.batch();
        snapshots.slice(index, index + 450).forEach((snapshot, offset) => {
            batch.update(snapshot.ref, updates(snapshot, index + offset));
        });
        await batch.commit();
    }
}

async function resolveUserIds(userId) {
    const ids = new Set([userId]);
    const queue = [userId];

    while (queue.length && ids.size < 100) {
        const currentId = queue.shift();
        const [directAlias, previousAliases] = await Promise.all([
            db.collection("userIdAliases").doc(currentId).get(),
            db.collection("userIdAliases").where("user_id", "==", currentId).get(),
        ]);
        const aliases = [];
        if (directAlias.exists && typeof directAlias.data().user_id === "string") {
            aliases.push(directAlias.data().user_id);
        }
        previousAliases.forEach((alias) => aliases.push(alias.id));
        aliases.forEach((aliasId) => {
            if (!ids.has(aliasId) && ids.size < 100) {
                ids.add(aliasId);
                queue.push(aliasId);
            }
        });
    }

    let currentId = userId;
    for (let count = 0; count < 20; count += 1) {
        const alias = await db.collection("userIdAliases").doc(currentId).get();
        if (!alias.exists || typeof alias.data().user_id !== "string") break;
        currentId = alias.data().user_id;
    }
    return { currentId, ids: [...ids] };
}

async function resolveUserId(userId) {
    return (await resolveUserIds(userId)).currentId;
}


// =================================
// TEST SERVER
// =================================

app.get("/", (req, res) => {

    res.send(
        "LINGO Backend Running"
    );

});

// =================================
// ADMINISTRATOR
// =================================

app.post("/api/admin/login", (req, res) => {
    if (!adminConfigurationIsReady()) {
        return res.status(503).json({ error: "Login administrator belum dikonfigurasi." });
    }

    const clientAddress = req.ip;
    const attempt = adminLoginAttempts.get(clientAddress) || { count: 0, blockedUntil: 0 };
    if (attempt.blockedUntil > Date.now()) {
        return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi beberapa menit." });
    }

    const username = typeof req.body.username === "string" ? req.body.username : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const usernameMatches = crypto.timingSafeEqual(
        crypto.createHash("sha256").update(username).digest(),
        crypto.createHash("sha256").update(process.env.ADMIN_USERNAME).digest()
    );
    const passwordMatches = crypto.timingSafeEqual(
        crypto.createHash("sha256").update(password).digest(),
        crypto.createHash("sha256").update(process.env.ADMIN_PASSWORD).digest()
    );

    if (!usernameMatches || !passwordMatches) {
        attempt.count += 1;
        if (attempt.count >= 5) {
            attempt.count = 0;
            attempt.blockedUntil = Date.now() + 5 * 60 * 1000;
        }
        adminLoginAttempts.set(clientAddress, attempt);
        return res.status(401).json({ error: "Username atau password salah." });
    }

    adminLoginAttempts.delete(clientAddress);
    return res.json({ token: createAdminToken(username) });
});

app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
        const [usersSnapshot, devicesSnapshot] = await Promise.all([
            db.collection("users").get(),
            db.collection("devices").get(),
        ]);
        const devicesByUser = new Map();

        devicesSnapshot.forEach((device) => {
            const userId = device.data().user_id;
            if (!devicesByUser.has(userId)) devicesByUser.set(userId, []);
            devicesByUser.get(userId).push(device.id);
        });

        const aliases = await db.collection("userIdAliases").get();
        const oldUserIds = new Set(aliases.docs.map((alias) => alias.id));
        return res.json(usersSnapshot.docs.filter((user) => !oldUserIds.has(user.id)).map((user) => ({
            id: user.id,
            ...user.data(),
            deviceIds: devicesByUser.get(user.id) || [],
        })));
    } catch (error) {
        console.error("ADMIN USER LIST ERROR:", error);
        return res.status(500).json({ error: "Daftar pengguna gagal dimuat." });
    }
});

app.put("/api/admin/devices/:deviceId", requireAdmin, async (req, res) => {
    const { deviceId: oldDeviceId } = req.params;
    const deviceId = typeof req.body.device_id === "string"
        ? req.body.device_id.trim()
        : oldDeviceId;
    const userId = typeof req.body.user_id === "string" ? req.body.user_id.trim() : "";

    if (!/^[A-Za-z0-9_-]{3,64}$/.test(deviceId)) {
        return res.status(400).json({ error: "LINGO ID harus 3–64 karakter (huruf, angka, _ atau -)." });
    }
    if (!userId) return res.status(400).json({ error: "User ID tujuan wajib diisi." });

    try {
        const oldDeviceRef = db.collection("devices").doc(oldDeviceId);
        const deviceRef = db.collection("devices").doc(deviceId);
        const userRef = db.collection("users").doc(userId);
        const [device, user, targetDevice] = await Promise.all([
            oldDeviceRef.get(),
            userRef.get(),
            deviceRef.get(),
        ]);
        if (!device.exists) return res.status(404).json({ error: "LINGO tidak ditemukan." });
        if (!user.exists) return res.status(404).json({ error: "User ID tidak ditemukan." });
        if (deviceId !== oldDeviceId && targetDevice.exists) {
            return res.status(409).json({ error: "LINGO ID tersebut sudah digunakan." });
        }

        const [sessions, activations] = await Promise.all([
            db.collection("sessions").where("device_id", "==", oldDeviceId).get(),
            db.collection("deviceActivations").where("device_id", "==", oldDeviceId).get(),
        ]);
        await deviceRef.set({ ...device.data(), device_id: deviceId, user_id: userId });
        try {
            await Promise.all([
                updateSnapshotsInBatches(sessions.docs, () => ({ device_id: deviceId, user_id: userId })),
                updateSnapshotsInBatches(activations.docs, () => ({ device_id: deviceId, user_id: userId })),
            ]);
            if (deviceId !== oldDeviceId) await oldDeviceRef.delete();
        } catch (error) {
            console.error("ADMIN DEVICE UPDATE PARTIAL MIGRATION:", { oldDeviceId, deviceId, error });
            return res.status(500).json({
                error: "Perubahan belum selesai. Periksa data LINGO sebelum mencoba lagi.",
            });
        }
        return res.json({ message: "LINGO ID dan pasangan user berhasil diperbarui.", device_id: deviceId });
    } catch (error) {
        console.error("ADMIN DEVICE UPDATE ERROR:", error);
        return res.status(500).json({ error: "Pasangan LINGO gagal diperbarui." });
    }
});

app.post("/api/admin/users/:userId/reset-id", requireAdmin, async (req, res) => {
    const { userId } = req.params;

    try {
        const userRef = db.collection("users").doc(userId);
        const user = await userRef.get();
        if (!user.exists) return res.status(404).json({ error: "User ID tidak ditemukan." });

        const newUserRef = db.collection("users").doc();
        const [devices, sessions, activations] = await Promise.all([
            db.collection("devices").where("user_id", "==", userId).get(),
            db.collection("sessions").where("user_id", "==", userId).get(),
            db.collection("deviceActivations").where("user_id", "==", userId).get(),
        ]);

        await newUserRef.create(user.data());
        try {
            await db.collection("userIdAliases").doc(userId).set({
                user_id: newUserRef.id,
                updated_at: new Date().toISOString(),
            });
            await Promise.all([
                updateSnapshotsInBatches(devices.docs, () => ({ user_id: newUserRef.id })),
                updateSnapshotsInBatches(sessions.docs, () => ({ user_id: newUserRef.id })),
                updateSnapshotsInBatches(activations.docs, () => ({ user_id: newUserRef.id })),
            ]);
            await userRef.delete();
        } catch (error) {
            console.error("ADMIN USER ID RESET PARTIAL MIGRATION:", { userId, newUserId: newUserRef.id, error });
            return res.status(500).json({
                error: "Migrasi belum selesai. ID baru tetap aktif; riwayat lama masih dapat diakses. Hubungi administrator server untuk memeriksa log.",
                new_user_id: newUserRef.id,
            });
        }

        return res.json({
            message: "User ID berhasil direset. Riwayat dan pasangan LINGO tetap dipertahankan.",
            old_user_id: userId,
            new_user_id: newUserRef.id,
        });
    } catch (error) {
        console.error("ADMIN USER ID RESET ERROR:", error);
        return res.status(500).json({ error: "User ID gagal direset." });
    }
});


// =================================
// GET DATA SESSION
// =================================

app.get(
    "/api/sessions/:userid",

    async (req, res) => {

        try {

            const { ids: userIds } = await resolveUserIds(req.params.userid);
            const snapshots = await Promise.all(
                Array.from({ length: Math.ceil(userIds.length / 30) }, (_, index) =>
                    db.collection("sessions")
                        .where("user_id", "in", userIds.slice(index * 30, (index + 1) * 30))
                        .get()
                )
            );


            let sessions = [];


            snapshots.forEach((snapshot) => snapshot.forEach((doc) => {
                sessions.push({ id: doc.id, ...doc.data() });
            }));


            res.json(
                sessions
            );


        } catch (error) {

            console.error(error);


            res.status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


// =================================
// DAFTARKAN PROFIL + PASANG LINGO
// =================================

app.post(
    "/api/devices/register",

    async (req, res) => {

        const code =
            typeof req.body.code === "string"
                ? req.body.code.trim()
                : "";

        const name =
            typeof req.body.name === "string"
                ? req.body.name.trim()
                : "";

        const age =
            Number(req.body.age);

        if (!/^[a-f0-9]{64}$/i.test(code)) {
            return res.status(400).json({
                error: "Kode aktivasi tidak valid. Scan QR pada perangkat LINGO.",
            });
        }

        if (!name || name.length > 80) {
            return res.status(400).json({
                error: "Nama anak wajib diisi (maksimal 80 karakter).",
            });
        }

        if (!Number.isInteger(age) || age < 1 || age > 18) {
            return res.status(400).json({
                error: "Umur harus berupa angka antara 1 sampai 18 tahun.",
            });
        }

        try {

            const activationRef = db
                .collection("deviceActivations")
                .doc(hashActivationCode(code));

            const activationSnapshot = await activationRef.get();

            if (!activationSnapshot.exists) {
                return res.status(404).json({
                    error: "QR tidak dikenal atau kode aktivasi sudah tidak berlaku.",
                });
            }

            const activation = activationSnapshot.data();
            const deviceId = activation.device_id;

            if (
                activation.status !== "available" ||
                typeof deviceId !== "string" ||
                !/^[A-Za-z0-9_-]{3,64}$/.test(deviceId)
            ) {
                return res.status(409).json({
                    error: "LINGO ini sudah didaftarkan atau kode aktivasi tidak aktif.",
                });
            }

            const userRef = db.collection("users").doc();
            const deviceRef = db.collection("devices").doc(deviceId);

            await db.runTransaction(async (transaction) => {

                const [currentActivation, currentDevice] = await Promise.all([
                    transaction.get(activationRef),
                    transaction.get(deviceRef),
                ]);

                if (
                    !currentActivation.exists ||
                    currentActivation.data().status !== "available"
                ) {
                    const error = new Error("ACTIVATION_ALREADY_USED");
                    error.code = "ACTIVATION_ALREADY_USED";
                    throw error;
                }

                if (currentDevice.exists) {
                    const error = new Error("DEVICE_ALREADY_REGISTERED");
                    error.code = "DEVICE_ALREADY_REGISTERED";
                    throw error;
                }

                const now = new Date().toISOString();

                transaction.create(userRef, {
                    name,
                    age,
                    created_at: now,
                });

                transaction.create(deviceRef, {
                    device_id: deviceId,
                    user_id: userRef.id,
                    paired_at: now,
                });

                transaction.update(activationRef, {
                    status: "claimed",
                    user_id: userRef.id,
                    claimed_at: now,
                });

            });

            return res.status(201).json({
                status: "success",
                user_id: userRef.id,
                device_id: deviceId,
                message: "Profil anak berhasil dibuat dan LINGO berhasil dipasangkan.",
            });

        } catch (error) {

            if (
                error.code === "ACTIVATION_ALREADY_USED" ||
                error.code === "DEVICE_ALREADY_REGISTERED"
            ) {
                return res.status(409).json({
                    error: "LINGO ini sudah terdaftar ke profil lain.",
                });
            }

            console.error("DEVICE REGISTRATION ERROR:", error);

            return res.status(500).json({
                error: "Pendaftaran gagal. Silakan coba lagi.",
            });

        }

    }
);


// =================================
// UPLOAD SESSION DARI ESP32
// =================================

app.post(
    "/api/session/upload",

    async (req, res) => {

        try {

            const data =
                req.body;

            const deviceId =
                typeof data.device_id === "string"
                    ? data.device_id.trim()
                    : "";

            if (!/^[A-Za-z0-9_-]{3,64}$/.test(deviceId)) {
                return res.status(400).json({
                    status: "error",
                    message: "device_id tidak valid.",
                });
            }

            const deviceSnapshot = await db
                .collection("devices")
                .doc(deviceId)
                .get();

            if (!deviceSnapshot.exists) {
                return res.status(403).json({
                    status: "error",
                    message: "Perangkat belum terdaftar.",
                });
            }

            const pairedUserId = await resolveUserId(deviceSnapshot.data().user_id);

            if (typeof pairedUserId !== "string" || !pairedUserId) {
                return res.status(403).json({
                    status: "error",
                    message: "Perangkat belum memiliki profil pasangan.",
                });
            }


            console.log(
                "DATA MASUK:",
                data
            );


            await db
                .collection("sessions")
                .add({

                    // Pemilik berasal dari data pairing, bukan dari user_id
                    // yang dikirim bebas oleh perangkat.
                    user_id:
                        pairedUserId,

                    device_id:
                        deviceId,

                    module:
                        data.module,

                    correct:
                        Number(
                            data.correct || 0
                        ),

                    wrong:
                        Number(
                            data.wrong || 0
                        ),

                    accuracy:
                        Number(
                            data.accuracy || 0
                        ),

                    duration:
                        Number(
                            data.duration || 0
                        ),

                    date:
                        new Date().toISOString()

                });


            res.status(200)
                .json({

                    status:
                        "success",

                    message:
                        "Data session berhasil disimpan"

                });


        } catch (error) {

            console.error(
                "UPLOAD ERROR:",
                error
            );


            res.status(500)
                .json({

                    status:
                        "error",

                    message:
                        error.message

                });

        }

    }
);


// =================================
// GET USER PROFILE
// =================================

app.get(
    "/api/users/:userId",

    async (req, res) => {

        try {

            const userId = await resolveUserId(req.params.userId);


            const doc =
                await db
                    .collection("users")
                    .doc(userId)
                    .get();


            if (!doc.exists) {

                return res
                    .status(404)
                    .json({

                        error:
                            "User tidak ditemukan"

                    });

            }


            res.json({

                id:
                    doc.id,

                ...doc.data()

            });


        } catch (error) {

            console.error(error);


            res.status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


// =================================
// UPDATE USER PROFILE
// =================================

app.put(
    "/api/users/:userId",

    async (req, res) => {

        try {

            const userId = await resolveUserId(req.params.userId);


            const {
                name,
                age
            } = req.body;


            if (!name) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Nama wajib diisi"

                    });

            }


            await db
                .collection("users")
                .doc(userId)
                .update({

                    name:
                        name.trim(),

                    age:
                        Number(age)

                });


            res.json({

                message:
                    "Profil berhasil diperbarui",

                id:
                    userId,

                name:
                    name.trim(),

                age:
                    Number(age)

            });


        } catch (error) {

            console.error(error);


            res.status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


// =================================
// SERVER
// =================================

const PORT =
    process.env.PORT || 3000;


app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `LINGO Backend running on port ${PORT}`
        );

    }
);