import {
    useMemo
} from "react";


import {
    Bar
} from "react-chartjs-2";


import {
    Chart as ChartJS,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend
} from "chart.js";


ChartJS.register(
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend
);



function ModuleChart({
    sessions = []
}) {


    // ================================
    // DATA BERDASARKAN MODUL
    // ================================

    const moduleData =
        useMemo(() => {

            const result = {};


            sessions.forEach(
                (item) => {

                    const module =
                        item.module ||
                        "Modul LINGO";


                    if (
                        !result[module]
                    ) {

                        result[module] = [];

                    }


                    result[module].push(
                        Number(
                            item.accuracy || 0
                        )
                    );

                }
            );


            return result;

        }, [sessions]);



    // ================================
    // URUTAN MODUL DIKUNCI
    // ================================

    const moduleOrder = [

        "Tantangan Bicara",

        "Mencocokan Suku Kata",

        "Misi Juara"

    ];



    const labels =
        moduleOrder.filter(
            (module) =>
                moduleData[module]
        );



    // ================================
    // HITUNG RATA-RATA
    // ================================

    const values =
        labels.map(
            (module) => {

                const values =
                    moduleData[module];


                const total =
                    values.reduce(
                        (a, b) =>
                            a + b,
                        0
                    );


                return Math.round(
                    total /
                    values.length
                );

            }
        );



    // ================================
    // DATA CHART
    // ================================

    const data = {

        labels:

            labels.map(
                (module) => {

                    if (
                        module ===
                        "Tantangan Bicara"
                    ) {

                        return [
                            "Tantangan",
                            "Bicara"
                        ];

                    }


                    if (
                        module ===
                        "Mencocokan Suku Kata"
                    ) {

                        return [
                            "Mencocokan",
                            "Suku Kata"
                        ];

                    }


                    if (
                        module ===
                        "Misi Juara"
                    ) {

                        return [
                            "Misi",
                            "Juara"
                        ];

                    }


                    return module;

                }
            ),


        datasets: [

            {

                label:
                    "Nilai Misi (%)",


                data:
                    values,


                backgroundColor:

                    labels.map(
                        (module) => {

                            if (
                                module ===
                                "Tantangan Bicara"
                            ) {

                                return "#4F7CFF";

                            }


                            if (
                                module ===
                                "Mencocokan Suku Kata"
                            ) {

                                return "#45C486";

                            }


                            if (
                                module ===
                                "Misi Juara"
                            ) {

                                return "#FF9F43";

                            }


                            return "#4F7CFF";

                        }
                    ),


                borderColor:

                    labels.map(
                        (module) => {

                            if (
                                module ===
                                "Tantangan Bicara"
                            ) {

                                return "#3D6EEA";

                            }


                            if (
                                module ===
                                "Mencocokan Suku Kata"
                            ) {

                                return "#35AD75";

                            }


                            if (
                                module ===
                                "Misi Juara"
                            ) {

                                return "#F28B2C";

                            }


                            return "#3D6EEA";

                        }
                    ),


                borderWidth:
                    1,


                borderRadius:
                    10,


                hoverBackgroundColor:

                    labels.map(
                        (module) => {

                            if (
                                module ===
                                "Tantangan Bicara"
                            ) {

                                return "#3D6EEA";

                            }


                            if (
                                module ===
                                "Mencocokan Suku Kata"
                            ) {

                                return "#35AD75";

                            }


                            if (
                                module ===
                                "Misi Juara"
                            ) {

                                return "#F28B2C";

                            }


                            return "#3D6EEA";

                        }
                    )

            }

        ]

    };



    // ================================
    // OPTIONS
    // ================================

    const options = {

        responsive:
            true,


        maintainAspectRatio:
            false,


        plugins: {

            // HILANGKAN LEGEND
            legend: {

                display:
                    false

            },


            tooltip: {

                callbacks: {

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

                            return value + "%";

                        }

                }

            }

        }

    };



    return (

        <div
            className="chart-card module-chart"

            style={{
                height:
                    "350px"
            }}
        >

            <h2>
                Kemampuan Modul LINGO
            </h2>


            <Bar
                data={data}
                options={options}
            />

        </div>

    );

}


export default ModuleChart;