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


            // Kompatibel dengan payload lama, tetapi menerima detail per halaman.
            // user_id SELALU dari pairing device pada Firestore, bukan request ESP.
            const catalog = {
                tantangan_bicara_1: { module: "Tantangan Bicara 1", page: 14, tasks: 4 },
                tantangan_bicara_2: { module: "Tantangan Bicara 2", page: 16, tasks: 12 },
                misi_juara_1: { module: "Misi Juara 1", page: 18, tasks: 2 },
                misi_juara_2: { module: "Misi Juara 2", page: 20, tasks: 2 },
                mencocokkan_suku_kata: { module: "Mencocokkan Suku Kata", page: 22, tasks: 7 }
            };
            const moduleId = typeof data.module_id === "string" ? data.module_id : null;
            const known = moduleId ? catalog[moduleId] : null;
            if (moduleId && !known) {
                return res.status(400).json({status:"error", message:"module_id tidak dikenal"});
            }
            const status = data.status === "pending_model" ? "pending_model" : "graded";
            if (known && known.page === 16 && status !== "pending_model") {
                return res.status(400).json({status:"error", message:"Model halaman 16 belum tersedia"});
            }
            const total = known ? known.tasks : Math.max(0, Number(data.total_question) || 0);
            const correct = Number(data.correct || 0);
            const wrong = Number(data.wrong || 0);
            const attempts = Number(data.attempts ?? (correct + wrong));
            const duration = Number(data.duration || 0);
            if (![total,correct,wrong,attempts,duration].every(Number.isFinite) ||
                correct < 0 || wrong < 0 || attempts < 0 || duration < 0 ||
                (known && correct > total) || correct > 1000 || wrong > 10000 || attempts > 10000) {
                return res.status(400).json({status:"error", message:"Nilai sesi tidak valid"});
            }
            const accuracy = status === "pending_model"
                ? null
                : (total > 0 ? Math.round(100 * correct / total) : Number(data.accuracy || 0));
            // Waktu main dari jam ESP32 (NTP). Dipakai bila wajar: tidak di masa depan
            // dan tidak lebih dari 1 tahun lalu. Jika tidak ada, pakai waktu upload.
            const uploadedAt = new Date();
            let playedAt = uploadedAt;
            if (typeof data.played_at === "string") {
                const t = new Date(data.played_at);
                const ageMs = uploadedAt - t;
                if (!Number.isNaN(t.getTime()) && ageMs > -5 * 60 * 1000 && ageMs < 365 * 24 * 3600 * 1000) {
                    playedAt = t;
                }
            }
            // Sesi yang dimainkan sebelum LINGO dipasangkan ke profil ini (mis. sisa
            // antrean pemilik lama setelah reset) ditolak permanen: firmware membuangnya.
            const pairedAt = new Date(deviceSnapshot.data().paired_at);
            if (playedAt !== uploadedAt && !Number.isNaN(pairedAt.getTime()) &&
                playedAt < pairedAt) {
                return res.status(409).json({status:"error", message:"Sesi dimainkan sebelum LINGO dipasangkan ke profil ini"});
            }
            const sessionId = typeof data.session_id === "string" ? data.session_id : "";
            if (sessionId && !/^[A-Za-z0-9_-]{5,100}$/.test(sessionId)) {
                return res.status(400).json({status:"error", message:"session_id tidak valid"});
            }
            const session = {
                user_id: pairedUserId,
                device_id: deviceId,
                module: known ? known.module : String(data.module || "Modul LINGO"),
                module_id: moduleId,
                page_number: known ? known.page : (data.page_number ?? null),
                total_question: total || null,
                correct,
                wrong,
                attempts,
                accuracy,
                duration,
                status,
                date: playedAt.toISOString(),
                uploaded_at: uploadedAt.toISOString()
            };
            if (sessionId) {
                // Deterministic document ID: retry upload tidak membuat duplikasi.
                const ref = db.collection("sessions").doc(sessionId);
                const prev = await ref.get();
                if (prev.exists) {
                    if (prev.data().device_id !== deviceId) {
                        return res.status(409).json({status:"error", message:"session_id sudah dipakai device lain"});
                    }
                    return res.status(200).json({status:"success", message:"Sesi sudah tersimpan", session_id:sessionId, duplicate:true});
                }
                await ref.set(session);
            } else {
                await db.collection("sessions").add(session);
            }
            console.log("SESSION PAGE:", deviceId, session.module, session.accuracy);
            // Ditampilkan di admin sebagai "Terakhir kirim data".
            await db.collection("devices").doc(deviceId).update({
                last_seen_at: uploadedAt.toISOString()
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
// SERVER
// =====================================================

const PORT =
    process.env.PORT ||
    3000;


// Guru: akun dengan akses read-only hanya pada ID murid yang diizinkan admin.
require("./teacher-routes").attachTeacherRoutes({ app, db, requireAdmin, JWT_SECRET });

// Orang tua: buka dashboard di perangkat lain lewat scan ulang QR atau link bagikan.
require("./access-routes").attachAccessRoutes({ app, db, FRONTEND_URL });

// Admin: reset / hapus LINGO, nonaktifkan profil. Orang tua: hapus profil.
require("./lifecycle-routes").attachLifecycleRoutes({ app, db, requireAdmin, FRONTEND_URL });

// Orang tua: atur daftar WiFi LINGO. LINGO: lapor & ambil perubahan WiFi.
require("./wifi-routes").attachWifiRoutes({ app, db });

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `LINGO Backend running on port ${PORT}`
        );

    }
);