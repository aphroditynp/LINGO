import {
    useEffect,
    useState
} from "react";


import API from "../api";
import { getCurrentUserId } from "../user";



function formatDuration(seconds) {

    const totalSeconds =
        Number(seconds || 0);


    const hours =
        Math.floor(
            totalSeconds / 3600
        );


    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );



    if (
        hours > 0
    ) {

        return (
            `${hours} jam ` +
            `${minutes} menit`
        );

    }



    return `${minutes} menit`;

}



function getScoreClass(score) {

    if (
        score >= 80
    ) {

        return "report-score-good";

    }



    if (
        score >= 60
    ) {

        return "report-score-medium";

    }



    return "report-score-low";

}



function Report({
    userIdOverride = null
}) {


    // =====================================================
    // USER ID
    // =====================================================

    const activeUserId =
        getCurrentUserId(
            userIdOverride
        );


    // =====================================================
    // STATE
    // =====================================================

    const [sessions, setSessions] =
        useState([]);


    const [user, setUser] =
        useState({

            name:
                "Pengguna LINGO",

            age:
                0

        });


    const [loading, setLoading] =
        useState(true);



    // =====================================================
    // LOAD DATA
    // =====================================================

    useEffect(() => {


        setLoading(true);


        Promise.all([

            API.get(
                `/sessions/${activeUserId}`
            ),

            API.get(
                `/users/${activeUserId}`
            )

        ])


            .then(
                ([
                    sessionResponse,
                    userResponse
                ]) => {


                    console.log(
                        "REPORT USER ID:",
                        activeUserId
                    );


                    console.log(
                        "REPORT SESSION:",
                        sessionResponse.data
                    );


                    console.log(
                        "REPORT USER:",
                        userResponse.data
                    );



                    setSessions(

                        Array.isArray(
                            sessionResponse.data
                        )

                            ?

                            sessionResponse.data

                            :

                            []

                    );



                    setUser(
                        userResponse.data
                    );

                }
            )


            .catch((error) => {

                console.error(
                    "Gagal mengambil report:",
                    error
                );

            })


            .finally(() => {

                setLoading(false);

            });


    }, [activeUserId]);



    // =====================================================
    // STATISTIK
    // =====================================================

    const totalSession =
        sessions.length;
    const assessedSessions = sessions.filter(x => x.status !== "pending_model" && x.accuracy != null);



    const average =
        assessedSessions.length > 0

            ?

            Math.round(

                assessedSessions.reduce(
                    (total, item) =>
                        total
                        +
                        Number(
                            item.accuracy || 0
                        ),

                    0
                )

                /

                assessedSessions.length

            )

            :

            0;



    const totalDuration =
        sessions.reduce(
            (total, item) =>
                total
                +
                Number(
                    item.duration || 0
                ),

            0
        );



    // =====================================================
    // RATA-RATA PER MODUL
    // =====================================================

    const moduleStats = {};



    assessedSessions.forEach(
        (item) => {


            const module =
                item.module ||
                "Modul LINGO";



            if (
                !moduleStats[module]
            ) {

                moduleStats[module] = {

                    total:
                        0,

                    count:
                        0

                };

            }



            moduleStats[module].total +=
                Number(
                    item.accuracy || 0
                );



            moduleStats[module].count++;

        }
    );



    const modules =
        Object.entries(
            moduleStats
        )

            .map(
                ([name, data]) => ({

                    name,

                    average:
                        Math.round(
                            data.total /
                            data.count
                        )

                })
            )

            .sort(
                (a, b) =>
                    b.average -
                    a.average
            );



    const bestModule =
        modules.length > 0

            ?

            modules[0]

            :

            null;



    const weakestModule =
        modules.length > 0

            ?

            modules[
                modules.length - 1
            ]

            :

            null;



    // =====================================================
    // REKOMENDASI
    // =====================================================

    let recommendation =
        "Belum ada cukup data untuk memberikan rekomendasi.";

    // Warna kotak: merah bila ada modul yang perlu dilatih.
    let recommendationTone =
        "no-data";



    if (
        weakestModule
    ) {


        if (
            weakestModule.average >= 80
        ) {


            recommendation =
                `Perkembangan ${user.name} terlihat baik. Pertahankan latihan secara rutin agar kemampuan tetap konsisten.`;

            recommendationTone =
                "good";

        } else {


            recommendation =
                `Latihan dapat lebih difokuskan pada modul ${weakestModule.name} yang saat ini memiliki rata-rata nilai ${weakestModule.average}%.`;

            recommendationTone =
                "needs-focus";

        }

    }



    // =====================================================
    // SESSION TERAKHIR
    // =====================================================

    const latestSession =
        [...sessions]

            .sort(
                (a, b) =>
                    new Date(b.date) -
                    new Date(a.date)
            )[0];



    // =====================================================
    // LOADING
    // =====================================================

    if (
        loading
    ) {

        return (

            <div
                className="container"
            >

                <div
                    className="report-empty"
                >

                    <h2>
                        Memuat laporan...
                    </h2>

                </div>

            </div>

        );

    }



    // =====================================================
    // RENDER
    // =====================================================

    return (

        <div
            className="container report-page"
        >


            {/* =================================================
                HEADER
            ================================================= */}

            <div
                className="report-header"
            >

                <div>

                    <span
                        className="report-label"
                    >

                        Laporan Perkembangan

                    </span>


                    <h1>

                        {user.name}

                    </h1>


                    <p>

                        Ringkasan perkembangan belajar
                        menggunakan LINGO.

                    </p>

                </div>



                <div
                    className="report-id"
                >

                    {activeUserId}

                </div>

            </div>



            {/* =================================================
                RECOMMENDATION
            ================================================= */}

            <div
                className={
                    `report-recommendation ${recommendationTone}`
                }
                role={
                    recommendationTone === "needs-focus"
                        ? "alert"
                        : undefined
                }
            >


                <div
                    className="recommendation-icon"
                >

                    {recommendationTone === "needs-focus"
                        ? "!"
                        : "★"
                    }

                </div>



                <div>

                    <span>
                        Rekomendasi LINGO
                    </span>


                    <p>

                        {recommendation}

                    </p>

                </div>


            </div>



            {/* =================================================
                SUMMARY
            ================================================= */}

            <div
                className="report-summary"
            >


                <div
                    className="report-stat"
                >

                    <span>
                        Total Sesi
                    </span>


                    <strong>
                        {totalSession}
                    </strong>


                    <small>
                        sesi belajar
                    </small>

                </div>



                <div
                    className="report-stat"
                >

                    <span>
                        Rata-rata Nilai
                    </span>


                    <strong>
                        {average}%
                    </strong>


                    <small>
                        seluruh sesi
                    </small>

                </div>



                <div
                    className="report-stat"
                >

                    <span>
                        Waktu Belajar
                    </span>


                    <strong>

                        {
                            formatDuration(
                                totalDuration
                            )
                        }

                    </strong>


                    <small>
                        total belajar
                    </small>

                </div>


            </div>



            {/* =================================================
                MODULE PERFORMANCE
            ================================================= */}

            <div
                className="report-card"
            >

                <div
                    className="report-card-header"
                >

                    <div>

                        <h2>
                            Perkembangan Modul
                        </h2>


                        <p>

                            Rata-rata nilai untuk setiap
                            modul LINGO.

                        </p>

                    </div>

                </div>



                <div
                    className="module-report-list"
                >


                    {modules.length === 0 ? (

                        <p>
                            Belum ada data modul.
                        </p>

                    ) : (

                        modules.map(
                            (module) => (

                                <div
                                    className="module-report-item"
                                    key={
                                        module.name
                                    }
                                >


                                    <div
                                        className="module-report-info"
                                    >

                                        <strong>

                                            {
                                                module.name
                                            }

                                        </strong>


                                        <span>

                                            {
                                                module.average
                                            }%

                                        </span>

                                    </div>



                                    <div
                                        className="module-report-progress"
                                    >

                                        <div
                                            className="module-report-bar"
                                            style={{
                                                width:
                                                    `${module.average}%`
                                            }}
                                        />

                                    </div>


                                </div>

                            )
                        )

                    )}


                </div>

            </div>



            {/* =================================================
                BEST + FOCUS
            ================================================= */}

            <div
                className="report-two-column"
            >


                <div
                    className="report-highlight best"
                >

                    <span>
                        Modul Terbaik
                    </span>


                    <h3>

                        {

                            bestModule

                                ?

                                bestModule.name

                                :

                                "-"

                        }

                    </h3>


                    <strong>

                        {

                            bestModule

                                ?

                                `${bestModule.average}%`

                                :

                                "-"

                        }

                    </strong>

                </div>



                <div
                    className="report-highlight focus"
                >

                    <span>
                        Fokus Latihan
                    </span>


                    <h3>

                        {

                            weakestModule

                                ?

                                weakestModule.name

                                :

                                "-"

                        }

                    </h3>


                    <strong>

                        {

                            weakestModule

                                ?

                                `${weakestModule.average}%`

                                :

                                "-"

                        }

                    </strong>

                </div>


            </div>



            {/* =================================================
                LATEST SESSION
            ================================================= */}

            {

                latestSession && (

                    <div
                        className="report-card latest-report"
                    >


                        <h2>
                            Sesi Terakhir
                        </h2>



                        <div
                            className="latest-session-grid"
                        >


                            <div>

                                <span>
                                    Modul
                                </span>


                                <strong>

                                    {
                                        latestSession.module
                                    }

                                </strong>

                            </div>



                            <div>

                                <span>
                                    Nilai
                                </span>


                                <strong
                                    className={
                                        getScoreClass(
                                            Number(
                                                latestSession.accuracy
                                            )
                                        )
                                    }
                                >

                                    {
                                        latestSession.accuracy
                                    }%

                                </strong>

                            </div>



                            <div>

                                <span>
                                    Benar
                                </span>


                                <strong>

                                    {
                                        latestSession.correct
                                    }

                                </strong>

                            </div>



                            <div>

                                <span>
                                    Salah
                                </span>


                                <strong>

                                    {
                                        latestSession.wrong
                                    }

                                </strong>

                            </div>



                            <div>

                                <span>
                                    Durasi
                                </span>


                                <strong>

                                    {
                                        formatDuration(
                                            latestSession.duration
                                        )
                                    }

                                </strong>

                            </div>


                        </div>


                    </div>

                )
            }


        </div>

    );

}


export default Report;