const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const db = require("./firebase");

const app = express();


// =================================
// MIDDLEWARE
// =================================

app.use(cors());

app.use(express.json());


// =================================
// ENVIRONMENT VARIABLES
// =================================

const ADMIN_USERNAME =
    process.env.ADMIN_USERNAME;

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD;

const JWT_SECRET =
    process.env.JWT_SECRET;

const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    "https://lingo-dashboard.onrender.com";


// =================================
// VALIDASI ENV ADMIN
// =================================

if (
    !ADMIN_USERNAME ||
    !ADMIN_PASSWORD ||
    !JWT_SECRET
) {

    console.warn(
        "WARNING: ADMIN_USERNAME, ADMIN_PASSWORD, atau JWT_SECRET belum diatur."
    );

}


// =================================
// HASH QR ACTIVATION CODE
// =================================

function hashActivationCode(code) {

    return crypto
        .createHash("sha256")
        .update(code)
        .digest("hex");

}


// =================================
// GENERATE ACTIVATION CODE
// =================================

function generateActivationCode() {

    return crypto
        .randomBytes(32)
        .toString("hex");

}


// =================================
// TEST SERVER
// =================================

app.get(
    "/",
    (req, res) => {

        res.send(
            "LINGO Backend Running"
        );

    }
);


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


            snapshot.forEach(
                (doc) => {

                    sessions.push({

                        id:
                            doc.id,

                        ...doc.data()

                    });

                }
            );


            res.json(
                sessions
            );


        } catch (error) {

            console.error(
                error
            );


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


        if (
            !/^[a-f0-9]{64}$/i.test(code)
        ) {

            return res.status(400).json({

                error:
                    "Kode aktivasi tidak valid. Scan QR pada perangkat LINGO."

            });

        }


        if (
            !name ||
            name.length > 80
        ) {

            return res.status(400).json({

                error:
                    "Nama anak wajib diisi (maksimal 80 karakter)."

            });

        }


        if (
            !Number.isInteger(age) ||
            age < 1 ||
            age > 18
        ) {

            return res.status(400).json({

                error:
                    "Umur harus berupa angka antara 1 sampai 18 tahun."

            });

        }


        try {

            const activationRef =
                db
                    .collection(
                        "deviceActivations"
                    )
                    .doc(
                        hashActivationCode(
                            code
                        )
                    );


            const activationSnapshot =
                await activationRef.get();


            if (
                !activationSnapshot.exists
            ) {

                return res.status(404).json({

                    error:
                        "QR tidak dikenal atau kode aktivasi sudah tidak berlaku."

                });

            }


            const activation =
                activationSnapshot.data();


            const deviceId =
                activation.device_id;


            if (
                activation.status !==
                    "available" ||

                typeof deviceId !==
                    "string" ||

                !/^[A-Za-z0-9_-]{3,64}$/
                    .test(deviceId)
            ) {

                return res.status(409).json({

                    error:
                        "LINGO ini sudah didaftarkan atau kode aktivasi tidak aktif."

                });

            }


            const userRef =
                db
                    .collection("users")
                    .doc();


            const deviceRef =
                db
                    .collection("devices")
                    .doc(deviceId);


            await db.runTransaction(
                async (transaction) => {

                    const [
                        currentActivation,
                        currentDevice
                    ] =
                        await Promise.all([

                            transaction.get(
                                activationRef
                            ),

                            transaction.get(
                                deviceRef
                            )

                        ]);


                    if (
                        !currentActivation.exists ||
                        currentActivation.data().status !==
                            "available"
                    ) {

                        const error =
                            new Error(
                                "ACTIVATION_ALREADY_USED"
                            );

                        error.code =
                            "ACTIVATION_ALREADY_USED";

                        throw error;

                    }


                    if (
                        currentDevice.exists
                    ) {

                        const error =
                            new Error(
                                "DEVICE_ALREADY_REGISTERED"
                            );

                        error.code =
                            "DEVICE_ALREADY_REGISTERED";

                        throw error;

                    }


                    const now =
                        new Date()
                            .toISOString();


                    transaction.create(
                        userRef,
                        {

                            name,

                            age,

                            created_at:
                                now

                        }
                    );


                    transaction.create(
                        deviceRef,
                        {

                            device_id:
                                deviceId,

                            user_id:
                                userRef.id,

                            paired_at:
                                now

                        }
                    );


                    transaction.update(
                        activationRef,
                        {

                            status:
                                "claimed",

                            user_id:
                                userRef.id,

                            claimed_at:
                                now

                        }
                    );

                }
            );


            return res.status(201).json({

                status:
                    "success",

                user_id:
                    userRef.id,

                device_id:
                    deviceId,

                message:
                    "Profil anak berhasil dibuat dan LINGO berhasil dipasangkan."

            });


        } catch (error) {

            if (
                error.code ===
                    "ACTIVATION_ALREADY_USED" ||

                error.code ===
                    "DEVICE_ALREADY_REGISTERED"
            ) {

                return res.status(409).json({

                    error:
                        "LINGO ini sudah terdaftar ke profil lain."

                });

            }


            console.error(
                "DEVICE REGISTRATION ERROR:",
                error
            );


            return res.status(500).json({

                error:
                    "Pendaftaran gagal. Silakan coba lagi."

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
                typeof data.device_id ===
                    "string"
                    ? data.device_id.trim()
                    : "";


            if (
                !/^[A-Za-z0-9_-]{3,64}$/
                    .test(deviceId)
            ) {

                return res.status(400).json({

                    status:
                        "error",

                    message:
                        "device_id tidak valid."

                });

            }


            const deviceSnapshot =
                await db
                    .collection("devices")
                    .doc(deviceId)
                    .get();


            if (
                !deviceSnapshot.exists
            ) {

                return res.status(403).json({

                    status:
                        "error",

                    message:
                        "Perangkat belum terdaftar."

                });

            }


            const pairedUserId =
                deviceSnapshot
                    .data()
                    .user_id;


            if (
                typeof pairedUserId !==
                    "string" ||

                !pairedUserId
            ) {

                return res.status(403).json({

                    status:
                        "error",

                    message:
                        "Perangkat belum memiliki profil pasangan."

                });

            }


            console.log(
                "DATA MASUK:",
                data
            );


            await db
                .collection("sessions")
                .add({

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
                        new Date()
                            .toISOString()

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


            if (
                !doc.exists
            ) {

                return res.status(404)
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

            console.error(
                error
            );


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

                return res.status(400)
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

            console.error(
                error
            );


            res.status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// ADMIN LOGIN
// =====================================================

app.post(
    "/api/admin/login",

    async (req, res) => {

        try {

            const username =
                typeof req.body.username ===
                    "string"
                    ? req.body.username.trim()
                    : "";


            const password =
                typeof req.body.password ===
                    "string"
                    ? req.body.password
                    : "";


            if (
                !ADMIN_USERNAME ||
                !ADMIN_PASSWORD ||
                !JWT_SECRET
            ) {

                return res.status(500).json({

                    error:
                        "Konfigurasi administrator belum tersedia."

                });

            }


            if (
                username !==
                    ADMIN_USERNAME ||

                password !==
                    ADMIN_PASSWORD
            ) {

                return res.status(401).json({

                    error:
                        "Username atau password salah."

                });

            }


            const token =
                jwt.sign(

                    {
                        role:
                            "admin",

                        username:
                            ADMIN_USERNAME

                    },

                    JWT_SECRET,

                    {
                        expiresIn:
                            "8h"
                    }

                );


            res.json({

                status:
                    "success",

                token

            });


        } catch (error) {

            console.error(
                "ADMIN LOGIN ERROR:",
                error
            );


            res.status(500).json({

                error:
                    "Login administrator gagal."

            });

        }

    }
);


// =====================================================
// ADMIN AUTHENTICATION MIDDLEWARE
// =====================================================

function requireAdmin(
    req,
    res,
    next
) {

    try {

        const authorization =
            req.headers.authorization ||
            "";


        if (
            !authorization.startsWith(
                "Bearer "
            )
        ) {

            return res.status(401).json({

                error:
                    "Akses administrator diperlukan."

            });

        }


        const token =
            authorization.substring(
                7
            );


        const decoded =
            jwt.verify(
                token,
                JWT_SECRET
            );


        if (
            decoded.role !==
                "admin"
        ) {

            return res.status(403).json({

                error:
                    "Akses ditolak."

            });

        }


        req.admin =
            decoded;


        next();


    } catch (error) {

        return res.status(401).json({

            error:
                "Sesi administrator tidak valid atau sudah berakhir."

        });

    }

}


// =====================================================
// ADMIN - GET ALL DEVICES
// =====================================================

app.get(
    "/api/admin/devices",

    requireAdmin,

    async (req, res) => {

        try {

            const snapshot =
                await db
                    .collection("devices")
                    .get();


            const devices = [];


            for (
                const doc
                of snapshot.docs
            ) {

                const device =
                    doc.data();


                let user =
                    null;


                if (
                    device.user_id
                ) {

                    const userDoc =
                        await db
                            .collection(
                                "users"
                            )
                            .doc(
                                device.user_id
                            )
                            .get();


                    if (
                        userDoc.exists
                    ) {

                        user = {

                            id:
                                userDoc.id,

                            ...userDoc.data()

                        };

                    }

                }


                devices.push({

                    device_id:
                        device.device_id ||
                        doc.id,

                    user_id:
                        device.user_id ||
                        null,

                    name:
                        user?.name ||
                        "-",

                    age:
                        user?.age ??
                        null,

                    paired_at:
                        device.paired_at ||
                        null,

                    status:
                        "active"

                });

            }


            res.json(
                devices
            );


        } catch (error) {

            console.error(
                "ADMIN GET DEVICES ERROR:",
                error
            );


            res.status(500).json({

                error:
                    "Gagal mengambil data perangkat."

            });

        }

    }
);


// =====================================================
// ADMIN - GET ALL USERS
// =====================================================

app.get(
    "/api/admin/users",

    requireAdmin,

    async (req, res) => {

        try {

            const snapshot =
                await db
                    .collection("users")
                    .get();


            const users = [];


            snapshot.forEach(
                (doc) => {

                    users.push({

                        id:
                            doc.id,

                        ...doc.data()

                    });

                }
            );


            res.json(
                users
            );


        } catch (error) {

            console.error(
                "ADMIN GET USERS ERROR:",
                error
            );


            res.status(500).json({

                error:
                    "Gagal mengambil data user."

            });

        }

    }
);


// =====================================================
// ADMIN - RESET LINGO
// =====================================================

app.post(
    "/api/admin/devices/:deviceId/reset",

    requireAdmin,

    async (req, res) => {

        try {

            const deviceId =
                req.params.deviceId;


            if (
                !/^[A-Za-z0-9_-]{3,64}$/
                    .test(deviceId)
            ) {

                return res.status(400).json({

                    error:
                        "Device ID tidak valid."

                });

            }


            const deviceRef =
                db
                    .collection("devices")
                    .doc(deviceId);


            const deviceDoc =
                await deviceRef.get();


            if (
                !deviceDoc.exists
            ) {

                return res.status(404).json({

                    error:
                        "LINGO tidak ditemukan."

                });

            }


            const device =
                deviceDoc.data();


            const oldUserId =
                device.user_id ||
                null;


            // ==========================================
            // Buat activation code baru
            // ==========================================

            const activationCode =
                generateActivationCode();


            const activationHash =
                hashActivationCode(
                    activationCode
                );


            const activationRef =
                db
                    .collection(
                        "deviceActivations"
                    )
                    .doc(
                        activationHash
                    );


            const now =
                new Date()
                    .toISOString();


            // ==========================================
            // Simpan activation baru
            // ==========================================

            await activationRef.set({

                device_id:
                    deviceId,

                status:
                    "available",

                created_at:
                    now,

                created_by:
                    "admin"

            });


            // ==========================================
            // Lepaskan pairing device
            // ==========================================

            await deviceRef.delete();


            // ==========================================
            // QR URL
            // ==========================================

            const activationUrl =
                `${FRONTEND_URL}/register-device?code=${activationCode}`;


            console.log(
                `LINGO RESET: ${deviceId}`
            );


            res.json({

                status:
                    "success",

                message:
                    "LINGO berhasil di-reset.",

                device_id:
                    deviceId,

                previous_user_id:
                    oldUserId,

                activation_code:
                    activationCode,

                activation_url:
                    activationUrl

            });


        } catch (error) {

            console.error(
                "ADMIN RESET ERROR:",
                error
            );


            res.status(500).json({

                error:
                    "Gagal melakukan reset LINGO."

            });

        }

    }
);


// =====================================================
// SERVER
// =====================================================

const PORT =
    process.env.PORT ||
    3000;


app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `LINGO Backend running on port ${PORT}`
        );

    }
);