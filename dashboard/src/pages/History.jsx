import {
    useEffect,
    useState
} from "react";

import API from "../api";


function formatDate(dateString) {

    const date = new Date(dateString);

    return date.toLocaleDateString(
        "id-ID",
        {
            day: "numeric",
            month: "long",
            year: "numeric"
        }
    );

}


function formatTime(dateString) {

    const date = new Date(dateString);

    return date.toLocaleTimeString(
        "id-ID",
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );

}


function formatDuration(seconds) {

    const totalSeconds =
        Number(seconds || 0);

    const minutes =
        Math.floor(
            totalSeconds / 60
        );

    const remainingSeconds =
        totalSeconds % 60;


    if (minutes === 0) {

        return `${remainingSeconds} detik`;

    }


    if (remainingSeconds === 0) {

        return `${minutes} menit`;

    }


    return `${minutes} menit ${remainingSeconds} detik`;

}


function getScoreClass(accuracy) {

    const score =
        Number(accuracy || 0);


    if (score >= 80) {

        return "score-good";

    }


    if (score >= 60) {

        return "score-medium";

    }


    return "score-low";

}


function History() {


    const [sessions, setSessions] =
        useState([]);


    const [loading, setLoading] =
        useState(true);



    useEffect(() => {


        API.get(
            "/sessions/BIMA001"
        )


            .then((response) => {


                const sortedData =
                    [...response.data].sort(
                        (a, b) => {

                            return (
                                new Date(b.date)
                                -
                                new Date(a.date)
                            );

                        }
                    );


                setSessions(
                    sortedData
                );


            })


            .catch((error) => {

                console.log(
                    error
                );

            })


            .finally(() => {

                setLoading(false);

            });


    }, []);



    return (

        <div className="container history-page">


            {/* HEADER */}

            <div className="history-header">

                <div>

                    <h1>
                        Riwayat Belajar
                    </h1>


                    <p>
                        Daftar aktivitas penggunaan LINGO
                    </p>

                </div>


                <div className="history-count">

                    {sessions.length}

                    <span>
                        sesi
                    </span>

                </div>

            </div>



            {/* TABLE */}

            <div className="table-card history-table-card">


                {loading ? (

                    <div className="history-empty">

                        <h3>
                            Memuat data...
                        </h3>

                    </div>

                ) : sessions.length === 0 ? (

                    <div className="history-empty">

                        <h3>
                            Belum ada aktivitas
                        </h3>

                        <p>
                            Sesi belajar LINGO akan muncul
                            di halaman ini.
                        </p>

                    </div>

                ) : (

                    <div className="history-table-wrapper">

                        <table>

                            <thead>

                                <tr>

                                    <th>
                                        Tanggal
                                    </th>

                                    <th>
                                        Modul
                                    </th>

                                    <th>
                                        Benar
                                    </th>

                                    <th>
                                        Salah
                                    </th>

                                    <th>
                                        Nilai
                                    </th>

                                    <th>
                                        Durasi
                                    </th>

                                </tr>

                            </thead>


                            <tbody>

                                {sessions.map(
                                    (item, index) => (

                                        <tr
                                            key={
                                                item.id ||
                                                index
                                            }
                                        >

                                            {/* TANGGAL */}

                                            <td>

                                                <div className="history-date">

                                                    {formatDate(
                                                        item.date
                                                    )}

                                                </div>


                                                <small className="history-time">

                                                    {formatTime(
                                                        item.date
                                                    )}

                                                    {" WIB"}

                                                </small>

                                            </td>


                                            {/* MODUL */}

                                            <td>

                                                <span
                                                    className={
                                                        "module-badge " +
                                                        (
                                                            item.module ===
                                                            "Tantangan Bicara"
                                                                ? "module-blue"
                                                                :
                                                            item.module ===
                                                            "Mencocokan Suku Kata"
                                                                ? "module-green"
                                                                :
                                                            "module-orange"
                                                        )
                                                    }
                                                >

                                                    {item.module}

                                                </span>

                                            </td>


                                            {/* BENAR */}

                                            <td>

                                                <span className="correct-value">

                                                    {item.correct}

                                                </span>

                                            </td>


                                            {/* SALAH */}

                                            <td>

                                                <span className="wrong-value">

                                                    {item.wrong}

                                                </span>

                                            </td>


                                            {/* NILAI */}

                                            <td>

                                                <span
                                                    className={
                                                        "score-badge " +
                                                        getScoreClass(
                                                            item.accuracy
                                                        )
                                                    }
                                                >

                                                    {item.accuracy}%

                                                </span>

                                            </td>


                                            {/* DURASI */}

                                            <td>

                                                {formatDuration(
                                                    item.duration
                                                )}

                                            </td>

                                        </tr>

                                    )
                                )}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>


        </div>

    );

}


export default History;