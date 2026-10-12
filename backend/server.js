const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const db = require("./firebase");

const app = express();


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


// =================================
// TEST SERVER
// =================================

app.get("/", (req, res) => {

    res.send(
        "LINGO Backend Running"
    );

});


// =================================
// GET DATA SESSION
// =================================

app.get(
    "/api/sessions/:userid",

    async (req, res) => {

        try {

            const userid =
                req.params.userid;


            const snapshot =
                await db
                    .collection("sessions")
                    .where(
                        "user_id",
                        "==",
                        userid
                    )
                    .get();


            let sessions = [];


            snapshot.forEach((doc) => {

                sessions.push({

                    id: doc.id,

                    ...doc.data()

                });

            });


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

            const pairedUserId = deviceSnapshot.data().user_id;

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

            const userId =
                req.params.userId;


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

            const userId =
                req.params.userId;


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