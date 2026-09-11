const express = require("express");
const cors = require("cors");

const db = require("./firebase");

const app = express();


// =================================
// MIDDLEWARE
// =================================

app.use(cors());

app.use(express.json());


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
// UPLOAD SESSION DARI ESP32
// =================================

app.post(
    "/api/session/upload",

    async (req, res) => {

        try {

            const data =
                req.body;


            console.log(
                "DATA MASUK:",
                data
            );


            await db
                .collection("sessions")
                .add({

                    user_id:
                        data.user_id,

                    device_id:
                        data.device_id,

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