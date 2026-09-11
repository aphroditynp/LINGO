import {
    useMemo
} from "react";


import {
    Line
} from "react-chartjs-2";


import {
    Chart as ChartJS,
    LineElement,
    CategoryScale,
    LinearScale,
    PointElement,
    Tooltip,
    Legend
} from "chart.js";


// REGISTER ELEMENT CHART
ChartJS.register(
    LineElement,
    CategoryScale,
    LinearScale,
    PointElement,
    Tooltip,
    Legend
);



function AccuracyChart({
    sessions = []
}) {


    // =====================================================
    // URUTKAN BERDASARKAN TANGGAL + JAM
    // =====================================================

    const sortedSessions =
        useMemo(() => {

            return [...sessions].sort(
                (a, b) => {

                    return (
                        new Date(a.date)
                        -
                        new Date(b.date)
                    );

                }
            );

        }, [sessions]);



    // =====================================================
    // DATA CHART
    // =====================================================

    const data = {

        labels:

            sortedSessions.map(
                (item, index) =>
                    `Sesi ${index + 1}`
            ),


        datasets: [

            {

                label:
                    "Nilai Belajar (%)",


                data:

                    sortedSessions.map(
                        item =>
                            Number(
                                item.accuracy || 0
                            )
                    ),


                // ==========================
                // WARNA LINGO
                // ==========================

                borderColor:
                    "#4F7CFF",


                backgroundColor:
                    "rgba(79, 124, 255, 0.10)",


                pointBackgroundColor:
                    "#4F7CFF",


                pointBorderColor:
                    "#FFFFFF",


                pointBorderWidth:
                    2,


                pointRadius:
                    5,


                pointHoverRadius:
                    7,


                borderWidth:
                    3,


                tension:
                    0.35,


                fill:
                    true

            }

        ]

    };



    // =====================================================
    // OPTIONS
    // =====================================================

    const options = {

        responsive:
            true,


        maintainAspectRatio:
            false,


        plugins: {

            legend: {

                position:
                    "top"

            },


            tooltip: {

                callbacks: {

                    // Tampilkan tanggal + jam
                    // ketika hover

                    title:
                        function(context) {

                            const index =
                                context[0]
                                    .dataIndex;


                            const session =
                                sortedSessions[
                                    index
                                ];


                            if (
                                session?.date
                            ) {

                                return new Date(
                                    session.date
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
                                );

                            }


                            return (
                                `Sesi ${index + 1}`
                            );

                        },


                    label:
                        function(context) {

                            return (
                                ` Nilai: ${context.raw}%`
                            );

                        }

                }

            }

        },


        scales: {

            y: {

                beginAtZero:
                    true,


                max:
                    100,


                ticks: {

                    callback:
                        function(value) {

                            return (
                                value + "%"
                            );

                        }

                }

            }

        }

    };



    return (

        <div
            className="chart-card"

            style={{
                height:
                    "350px"
            }}
        >

            <h2>
                Perkembangan Nilai LINGO
            </h2>


            <Line
                data={data}
                options={options}
            />

        </div>

    );

}


export default AccuracyChart;