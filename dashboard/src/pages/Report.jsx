import {
useEffect,
useState
}
from "react";


import API from "../api";



function Report(){


const [sessions,setSessions]
=
useState([]);



useEffect(()=>{


API.get(
"/sessions/BIMA001"
)


.then((response)=>{


setSessions(response.data);


});


},[]);





const totalSession =
sessions.length;



const average =

sessions.length > 0 ?

Math.round(

sessions.reduce(
(total,item)=>
total+item.accuracy,
0

)
/sessions.length

)

:0;





let bestModule="-";


if(sessions.length>0){


const best =
sessions.reduce(

(prev,current)=>

prev.accuracy >
current.accuracy ?

prev:

current

);


bestModule =
best.module;


}





return(

<div className="container">


<h1>
Laporan Perkembangan
</h1>



<div className="profile-card">


<h2>
BIMA001
</h2>


<p>
Total Sesi:
{totalSession}
</p>


<p>
Rata-rata Nilai:
{average}%
</p>


<p>
Modul Terbaik:
{bestModule}
</p>


</div>





<div className="recommendation">


<h3>
Rekomendasi
</h3>


<p>


Anak terus mengalami perkembangan.
Latihan dapat difokuskan pada modul dengan nilai terendah.


</p>


</div>



</div>

)

}



export default Report;