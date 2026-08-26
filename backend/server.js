const express = require("express");
const cors = require("cors");

const db = require("./firebase");


const app = express();


app.use(cors());

app.use(express.json());



// TEST SERVER

app.get("/",(req,res)=>{

    res.send(
        "LINGO Backend Running"
    );

});



// GET DATA SESSION

app.get(
"/api/sessions/:userid",

async(req,res)=>{


    try{


        const userid =
        req.params.userid;



        const snapshot =
        await db
        .collection("sessions")
        .where(
            "user_id",
            "==",
            userid
        )
        .get();



        let sessions=[];



        snapshot.forEach(doc=>{


            sessions.push({

                id:doc.id,

                ...doc.data()

            });


        });



        res.json(sessions);


    }


    catch(error){


        res.status(500)
        .json({

            error:error.message

        });


    }


});

// =============================
// UPLOAD DATA DARI ESP32
// =============================


app.post(
"/api/session/upload",

async(req,res)=>{


try{


const data = req.body;



await db
.collection("sessions")
.add({

user_id:data.user_id,

device_id:data.device_id,

module:data.module,

correct:data.correct,

wrong:data.wrong,

accuracy:data.accuracy,

duration:data.duration,

date:
new Date().toISOString()

});



res.json({

status:"success",

message:
"Session uploaded"

});


}


catch(error){


res.status(500)
.json({

status:"error",

message:
error.message

});


}


});

// =================================
// ESP32 UPLOAD SESSION DATA
// =================================


app.post(
"/api/session/upload",

async(req,res)=>{


try{


const data = req.body;



console.log(
"DATA MASUK:",
data
);



await db
.collection("sessions")
.add({


user_id:
data.user_id,


device_id:
data.device_id,


module:
data.module,


correct:
data.correct,


wrong:
data.wrong,


accuracy:
data.accuracy,


duration:
data.duration,


date:
new Date().toISOString()



});



res.status(200).json({

status:"success",

message:
"Data session berhasil disimpan"

});



}

catch(error){


console.error(error);


res.status(500).json({

status:"error",

message:error.message

});


}


});

app.listen(
3000,
()=>{

console.log(
"Server running on port 3000"
);

});