import {
    useEffect,
    useState
}
from "react";


import API from "../api";


import {
    Bar
}
from "react-chartjs-2";


import {

Chart as ChartJS,

BarElement,

CategoryScale,

LinearScale,

Tooltip,

Legend

}

from "chart.js";



ChartJS.register(

BarElement,

CategoryScale,

LinearScale,

Tooltip,

Legend

);



function ModuleChart(){


const [sessions,setSessions]
=
useState([]);



useEffect(()=>{


API.get(
"/sessions/BIMA001"
)


.then((response)=>{


setSessions(response.data);


})


.catch((error)=>{


console.log(error);


});


},[]);





// Ambil data berdasarkan modul

const moduleData = {};



sessions.forEach((item)=>{


if(!moduleData[item.module]){


moduleData[item.module]=[];


}


moduleData[item.module]
.push(item.accuracy);


});




// Hitung rata-rata setiap modul


const labels =
Object.keys(moduleData);



const values = labels.map(
(module)=>{


const total =
moduleData[module]
.reduce(
(a,b)=>a+b,
0
);


return Math.round(
total/moduleData[module].length
);


}

);




const data={


labels:labels,


datasets:[

{

label:
"Kemampuan (%)",


data:values,


borderWidth:1

}

]


};





return(

<div className="chart-card module-chart">


<h2>
Kemampuan Modul LINGO
</h2>


<Bar

data={data}

/>


</div>

)


}


export default ModuleChart;