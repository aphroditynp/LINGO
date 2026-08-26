import {
    useEffect,
    useState
} from "react";


import StatCard from "../components/StatCard";

import AccuracyChart 
from "../components/AccuracyChart";

import ModuleChart
from "../components/ModuleChart";


import API from "../api";



function Dashboard(){


const [sessions,setSessions] = useState([]);



// Ambil data dari Firebase melalui backend

useEffect(()=>{


    API.get(
        "/sessions/BIMA001"
    )


    .then((response)=>{

    console.log("DATA FIREBASE:", response.data);

    setSessions(response.data);


    })


    .catch((error)=>{


        console.log(error);


    });


},[]);





// =====================
// HITUNG STATISTIK
// =====================


const totalSession = 
sessions.length;



const averageScore =

sessions.length > 0 ?

Math.round(

sessions.reduce(

(total,item)=>

total + item.accuracy,

0

)

/

sessions.length

)

:0;





const totalDuration =

sessions.reduce(

(total,item)=>

total + item.duration,

0

);




// ubah detik ke jam + menit

const hours =

Math.floor(

totalDuration / 3600

);



const minutes =

Math.floor(

(totalDuration % 3600) / 60

);



let durationText = "";



if(hours > 0){

durationText += hours + " Jam ";

}



if(minutes > 0){

durationText += minutes + " Menit";

}



if(durationText === ""){

durationText = "0 Menit";

}




return(

<div className="container">


<h1>
Dashboard LINGO
</h1>


<p>
Monitoring perkembangan membaca anak
</p>




<div className="cards">


<StatCard

title="Total Sesi"

value={totalSession}

/>



<StatCard

title="Rata-rata Nilai"

value={`${averageScore}%`}

/>



<StatCard

title="Durasi Belajar"

value={durationText}

/>



</div>





<AccuracyChart />



<ModuleChart />



</div>


)


}



export default Dashboard;