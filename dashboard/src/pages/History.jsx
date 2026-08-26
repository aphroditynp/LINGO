import {
    useEffect,
    useState
}
from "react";


import API from "../api";

function formatDate(dateString){

    const date = new Date(dateString);


    return date.toLocaleDateString(
        "id-ID",
        {
            day:"numeric",
            month:"long",
            year:"numeric"
        }
    );

}


function formatTime(dateString){

    const date = new Date(dateString);


    return date.toLocaleTimeString(
        "id-ID",
        {
            hour:"2-digit",
            minute:"2-digit"
        }
    );

}

function History(){


const [sessions,setSessions] = useState([]);



useEffect(()=>{


    API.get(
        "/sessions/BIMA001"
    )


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




return(

<div className="container">


<h1>
Riwayat Belajar
</h1>


<p>
Daftar aktivitas penggunaan LINGO
</p>




<div className="table-card">


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


{

sessions.map(

(item,index)=>(


<tr key={index}>


<td>

<div>
{
formatDate(item.date)
}
</div>


<small>

{
formatTime(item.date)
}

</small>

</td>



<td>

{
item.module
}

</td>



<td>

{
item.correct
}

</td>



<td>

{
item.wrong
}

</td>



<td>

{
item.accuracy
}%

</td>



<td>

{
Math.floor(
item.duration/60
)
}
 menit

</td>


</tr>


)


)

}


</tbody>



</table>


</div>



</div>


)


}



export default History;