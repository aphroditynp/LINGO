import {
    useEffect,
    useMemo,
    useState
} from "react";


import StatCard
from "../components/StatCard";


import AccuracyChart
from "../components/AccuracyChart";


import ModuleChart
from "../components/ModuleChart";


import API
from "../api";



function Dashboard() {


    // =====================================================
    // STATE
    // =====================================================

    const [sessions, setSessions] =
        useState([]);


    const [profile, setProfile] =
        useState(null);


    const [loading, setLoading] =
        useState(true);


    const [lastUpdate, setLastUpdate] =
        useState(null);


    const [period, setPeriod] =
        useState("all");


    const [selectedStat, setSelectedStat] =
        useState(null);



    // =====================================================
    // AMBIL DATA FIREBASE
    // =====================================================

    const loadSessions = () => {

        setLoading(true);


        Promise.all([

            API.get(
                "/sessions/BIMA001"
            ),

            API.get(
                "/users/BIMA001"
            )

        ])


            .then(
                ([
                    sessionsResponse,
                    profileResponse
                ]) => {


                    console.log(
                        "DATA FIREBASE:",
                        sessionsResponse.data
                    );


                    console.log(
                        "DATA PROFILE:",
                        profileResponse.data
                    );



                    // ============================
                    // SESSION
                    // ============================

                    setSessions(

                        Array.isArray(
                            sessionsResponse.data
                        )

                            ?

                            sessionsResponse.data

                            :

                            []

                    );



                    // ============================
                    // PROFILE
                    // ============================

                    setProfile(
                        profileResponse.data
                    );



                    // ============================
                    // LAST UPDATE
                    // ============================

                    setLastUpdate(
                        new Date()
                    );

                }
            )


            .catch((error) => {

                console.error(
                    "Gagal mengambil data:",
                    error
                );

            })


            .finally(() => {

                setLoading(false);

            });

    };



    // =====================================================
    // LOAD AWAL
    // =====================================================

    useEffect(() => {

        loadSessions();

    }, []);



    // =====================================================
    // FILTER DATA BERDASARKAN PERIODE
    // =====================================================

    const filteredSessions =

        useMemo(() => {


            if (
                period === "all"
            ) {

                return sessions;

            }



            const now =
                new Date();



            const days =
                period === "7"
                    ? 7
                    : 30;



            const limit =
                new Date(

                    now.getTime()

                    -

                    days *
                    24 *
                    60 *
                    60 *
                    1000

                );



            return sessions.filter(
                (item) => {


                    const date =
                        new Date(
                            item.date
                        );



                    return (

                        !isNaN(
                            date.getTime()
                        )

                        &&

                        date >= limit

                    );

                }
            );


        }, [sessions, period]);



    // =====================================================
    // STATISTIK
    // =====================================================

    const totalSession =
        filteredSessions.length;



    const averageScore =

        filteredSessions.length > 0

            ?

            Math.round(

                filteredSessions.reduce(
                    (total, item) => {

                        return (

                            total

                            +

                            Number(
                                item.accuracy || 0
                            )

                        );

                    },

                    0

                )

                /

                filteredSessions.length

            )

            :

            0;



    const totalDuration =

        filteredSessions.reduce(
            (total, item) => {

                return (

                    total

                    +

                    Number(
                        item.duration || 0
                    )

                );

            },

            0

        );



    // =====================================================
    // DURASI
    // =====================================================

    const hours =

        Math.floor(
            totalDuration / 3600
        );



    const minutes =

        Math.floor(

            (totalDuration % 3600)

            /

            60

        );



    let durationText =
        "";



    if (hours > 0) {

        durationText +=
            hours + " Jam ";

    }



    if (minutes > 0) {

        durationText +=
            minutes + " Menit";

    }



    if (durationText === "") {

        durationText =
            "0 Menit";

    }



    // =====================================================
    // SESSION TERBARU
    // =====================================================

    const recentSessions =

        [...filteredSessions]

            .sort(
                (a, b) => {

                    return (

                        new Date(
                            b.date
                        )

                        -

                        new Date(
                            a.date
                        )

                    );

                }
            )

            .slice(
                0,
                5
            );



    // =====================================================
    // DETAIL STAT CARD
    // =====================================================

    const statDetails = {

        sessions: {

            title:
                "Total Sesi",

            description:
                "Jumlah sesi belajar yang telah dilakukan."

        },


        score: {

            title:
                "Rata-rata Nilai",

            description:
                "Rata-rata akurasi dari seluruh sesi pada periode yang dipilih."

        },


        duration: {

            title:
                "Durasi Belajar",

            description:
                "Total waktu belajar anak pada periode yang dipilih."

        }

    };



    // =====================================================
    // RENDER
    // =====================================================

    return (

        <div
            className="container dashboard-page"
        >


            {/* =================================================
                HEADER
            ================================================= */}

            <div
                className="dashboard-header"
            >

                <div>


                    <div
                        className="dashboard-greeting"
                    >

                        Halo,{" "}

                        {

                            profile?.name

                                ?

                                profile.name

                                :

                                "Pengguna LINGO"

                        }

                    </div>



                    <h1>

                        Dashboard LINGO

                    </h1>



                    <p>

                        Pantau perkembangan belajar membaca{" "}

                        {

                            profile?.name

                                ?

                                profile.name

                                :

                                "anak"

                        }

                        {" "}secara berkala.

                    </p>


                    {

                        profile?.age && (

                            <div
                                className="dashboard-profile-info"
                            >

                                {profile.age} tahun

                            </div>

                        )

                    }


                </div>



                {/* =================================================
                    USER PROFILE
                ================================================= */}

                <div
                    className="dashboard-user"
                >


                    <div
                        className="dashboard-avatar"
                    >

                        {

                            profile?.name

                                ?

                                profile.name
                                    .charAt(0)
                                    .toUpperCase()

                                :

                                "?"

                        }

                    </div>



                    <div>

                        <strong>

                            {

                                profile?.name

                                    ?

                                    profile.name

                                    :

                                    "Pengguna LINGO"

                            }

                        </strong>



                        {

                            profile?.age && (

                                <small>

                                    {profile.age} tahun

                                </small>

                            )

                        }

                    </div>


                </div>


            </div>



            {/* =================================================
                ACTION
            ================================================= */}

            <div
                className="dashboard-actions"
            >

                <button
                    type="button"
                    onClick={loadSessions}
                    disabled={loading}
                    className="refresh-button"
                >

                    {

                        loading

                            ?

                            "Memuat..."

                            :

                            "↻ Refresh"

                    }

                </button>

            </div>



            {/* =================================================
                STATUS
            ================================================= */}

            <div
                className="dashboard-status"
            >

                <span
                    className="status-dot"
                >
                </span>



                <span>

                    {

                        loading

                            ?

                            "Memuat data..."

                            :

                            "Data tersambung"

                    }

                </span>



                {

                    lastUpdate && (

                        <span
                            className="last-update"
                        >

                            • Diperbarui{" "}

                            {

                                lastUpdate.toLocaleTimeString(

                                    "id-ID",

                                    {

                                        hour:
                                            "2-digit",

                                        minute:
                                            "2-digit"

                                    }

                                )

                            }

                        </span>

                    )

                }

            </div>



            {/* =================================================
                PERIOD FILTER
            ================================================= */}

            <div
                className="dashboard-toolbar"
            >

                <div>

                    <h3>

                        Ringkasan Perkembangan

                    </h3>


                    <span>

                        Pilih periode data

                    </span>

                </div>



                <div
                    className="period-buttons"
                >


                    <button
                        type="button"

                        className={

                            period === "all"

                                ?

                                "period-active"

                                :

                                ""

                        }

                        onClick={() =>
                            setPeriod("all")
                        }
                    >

                        Semua

                    </button>



                    <button
                        type="button"

                        className={

                            period === "7"

                                ?

                                "period-active"

                                :

                                ""

                        }

                        onClick={() =>
                            setPeriod("7")
                        }
                    >

                        7 Hari

                    </button>



                    <button
                        type="button"

                        className={

                            period === "30"

                                ?

                                "period-active"

                                :

                                ""

                        }

                        onClick={() =>
                            setPeriod("30")
                        }
                    >

                        30 Hari

                    </button>


                </div>

            </div>



            {/* =================================================
                STAT CARDS
            ================================================= */}

            <div
                className="cards"
            >


                <div
                    className="interactive-stat"

                    onClick={() =>
                        setSelectedStat(
                            "sessions"
                        )
                    }
                >

                    <StatCard

                        title="Total Sesi"

                        value={
                            totalSession
                        }

                    />

                </div>



                <div
                    className="interactive-stat"

                    onClick={() =>
                        setSelectedStat(
                            "score"
                        )
                    }
                >

                    <StatCard

                        title="Rata-rata Nilai"

                        value={
                            `${averageScore}%`
                        }

                    />

                </div>



                <div
                    className="interactive-stat"

                    onClick={() =>
                        setSelectedStat(
                            "duration"
                        )
                    }
                >

                    <StatCard

                        title="Durasi Belajar"

                        value={
                            durationText
                        }

                    />

                </div>


            </div>



            {/* =================================================
                DETAIL STAT
            ================================================= */}

            {

                selectedStat && (

                    <div
                        className="stat-detail"
                    >

                        <div>

                            <strong>

                                {

                                    statDetails[
                                        selectedStat
                                    ].title

                                }

                            </strong>



                            <p>

                                {

                                    statDetails[
                                        selectedStat
                                    ].description

                                }

                            </p>

                        </div>



                        <button
                            type="button"

                            onClick={() =>
                                setSelectedStat(
                                    null
                                )
                            }
                        >

                            Tutup

                        </button>

                    </div>

                )

            }



            {/* =================================================
                EMPTY STATE
            ================================================= */}

            {

                !loading &&

                filteredSessions.length === 0 && (

                    <div
                        className="empty-state"
                    >

                        <div
                            className="empty-icon"
                        >

                            ○

                        </div>



                        <h3>

                            Belum ada data pada periode ini

                        </h3>



                        <p>

                            Coba pilih periode lain atau
                            lakukan sesi belajar baru.

                        </p>

                    </div>

                )

            }



            {/* =================================================
                ACCURACY CHART
            ================================================= */}

            {

                filteredSessions.length > 0 && (

                    <AccuracyChart
                        sessions={
                            filteredSessions
                        }
                    />

                )

            }



            {/* =================================================
                MODULE CHART
            ================================================= */}

            {

                filteredSessions.length > 0 && (

                    <ModuleChart
                        sessions={
                            filteredSessions
                        }
                    />

                )

            }



            {/* =================================================
                RECENT ACTIVITY
            ================================================= */}

            {

                recentSessions.length > 0 && (

                    <div
                        className="recent-card"
                    >


                        <div
                            className="recent-header"
                        >

                            <div>

                                <h2>

                                    Aktivitas Terbaru

                                </h2>


                                <p>

                                    Lima sesi belajar terakhir

                                </p>

                            </div>



                            <span
                                className="activity-count"
                            >

                                {
                                    recentSessions.length
                                }

                                {" "}sesi

                            </span>

                        </div>



                        <div
                            className="recent-list"
                        >


                            {

                                recentSessions.map(
                                    (item, index) => (

                                        <div
                                            className="recent-item"

                                            key={
                                                item.id ||
                                                index
                                            }
                                        >


                                            <div
                                                className="recent-icon"
                                            >

                                                {

                                                    item.accuracy >= 80

                                                        ?

                                                        "✓"

                                                        :

                                                        "!"

                                                }

                                            </div>



                                            <div
                                                className="recent-info"
                                            >

                                                <strong>

                                                    {

                                                        item.module ||

                                                        "Modul LINGO"

                                                    }

                                                </strong>



                                                <span>

                                                    {

                                                        item.date

                                                            ?

                                                            new Date(
                                                                item.date
                                                            ).toLocaleString(

                                                                "id-ID",

                                                                {

                                                                    day:
                                                                        "2-digit",

                                                                    month:
                                                                        "short",

                                                                    year:
                                                                        "numeric",

                                                                    hour:
                                                                        "2-digit",

                                                                    minute:
                                                                        "2-digit"

                                                                }

                                                            )

                                                            :

                                                            "-"

                                                    }

                                                </span>

                                            </div>



                                            <div
                                                className="recent-score"
                                            >

                                                <strong>

                                                    {

                                                        item.accuracy ||

                                                        0

                                                    }%

                                                </strong>



                                                <span>

                                                    Nilai

                                                </span>

                                            </div>


                                        </div>

                                    )

                                )

                            }


                        </div>

                    </div>

                )

            }


        </div>

    );

}


export default Dashboard;