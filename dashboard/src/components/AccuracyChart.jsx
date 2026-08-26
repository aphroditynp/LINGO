import {
    useEffect,
    useState
} from "react";


import API from "../api";


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



function AccuracyChart(){


    const [sessions,setSessions] = useState([]);



    useEffect(()=>{


        API.get("/sessions/BIMA001")

            .then((response)=>{


    const sortedData = response.data.sort(
        (a,b)=>{

            return new Date(a.date) - new Date(b.date);

        }
    );


    setSessions(sortedData);


    })

        .catch((error)=>{

            console.log(error);

        });


    },[]);



    const data = {

        labels:

        sessions.map(
            (item,index)=>
            `Sesi ${index+1}`
        ),



        datasets:[

            {

                label:
                "Akurasi (%)",


                data:

                sessions.map(
                    item =>
                    item.accuracy
                ),


                borderWidth:3,


                tension:0.4

            }

        ]

    };



    const options={

        responsive:true,


        maintainAspectRatio:false

    };



    return(

        <div 
        className="chart-card"
        style={{
            height:"350px"
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

    )


}


export default AccuracyChart;