#include <Arduino.h>

#include <WiFi.h>

#include <WiFiManager.h>

#include <HTTPClient.h>

#include <ArduinoJson.h>


WiFiManager wm;

// ======================
// SERVER
// ======================


String serverURL =

"http://192.168.1.7:3000/api/session/upload";


// ======================
// SEND DATA
// ======================

void sendSession(){



if(
WiFi.status()==WL_CONNECTED
){


HTTPClient http;



http.begin(
serverURL
);



http.addHeader(
"Content-Type",
"application/json"
);




StaticJsonDocument<300> doc;



doc["user_id"]
=
"BIMA001";


doc["device_id"]
=
"LINGO001";


doc["module"]
=
"Tantangan Bicara";


doc["correct"]
=
18;


doc["wrong"]
=
2;


doc["accuracy"]
=
90;


doc["duration"]
=
600;



String json;



serializeJson(
doc,
json
);



Serial.println(json);



int code =

http.POST(json);



Serial.print(
"HTTP:"
);


Serial.println(code);



http.end();



}

}

// ======================
// SETUP
// ======================


void setup(){


Serial.begin(115200);



delay(1000);



// reset hanya jika diperlukan
// wm.resetSettings();



// Nama hotspot ESP32

bool res = wm.autoConnect(
"LINGO_SETUP"
);



if(!res){


Serial.println(
"WiFi gagal"
);


ESP.restart();


}



Serial.println();

Serial.println(
"WiFi Connected"
);



Serial.print(
"IP ESP32 : "
);


Serial.println(
WiFi.localIP()
);



sendSession();


}





void loop(){


    if(Serial.available()){


        char command = Serial.read();



        if(command == 'r'){

            Serial.println(
                "Reset WiFi..."
            );


            wm.resetSettings();


            delay(1000);


            ESP.restart();

        }


    }


}





