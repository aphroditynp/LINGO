#define EIDSP_QUANTIZE_FILTERBANK 0

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <Wire.h>
#include <BitBang_I2C.h> // Library Bitbang khusus MCU 32-bit
#include <DFRobotDFPlayerMini.h>
// #include <LINGO_Speech_Recognition_inferencing.h>
#include "LINGO_Speech_Recognition_inferencing.h"
#include "driver/i2s.h"
#include <string.h>

//BACA DULUUUUUUUUUUUUUUUUUUUUU
//HALAMAN BERARTI INDEKS TOMBOL
//MISALKAN HALAMAN 14 BERARTI TOMBOL 14 (Indeks ke 8)

// =========================================================
// Konfigurasi I2C & DFPlayer
// =========================================================
#define SDA_1 8
#define SCL_1 9
#define SDA_2 6
#define SCL_2 7
#define SDA_3 1
#define SCL_3 2

BBI2C myWire3; // Objek untuk BitBang I2C
const uint8_t PCF_ADDR = 0x20; 

#define DF_RX 18 
#define DF_TX 17 
HardwareSerial mySerial(1); 

DFRobotDFPlayerMini myDFPlayer;

// =========================================================
// WIFI LINGO
// =========================================================

WiFiManager wm;

String serverURL =
  "http://192.168.1.7:3000/api/session/upload";

#define TRACK_WIFI_SETUP 399
#define TRACK_WIFI_FAILED 400

const unsigned long WIFI_CONNECT_TIMEOUT = 15000;
const unsigned long WIFI_AUDIO_INTERVAL = 7000;

unsigned long lastWifiAudio = 0;

Preferences wifiPreferences;

enum WiFiState {
  WIFI_FIRST_SETUP,
  WIFI_CONNECTING,
  WIFI_ONLINE,
  WIFI_FAILED,
  WIFI_OFFLINE
};

WiFiState wifiState = WIFI_CONNECTING;

// LINGO hanya memproses tombol permainan jika READY.
bool lingoReady = false;


uint16_t lastState1 = 0xFFFF;
uint16_t lastState2 = 0xFFFF;
uint16_t lastState3 = 0xFFFF;


// =========================================================
// KONFIGURASI MICROPHONE INMP441 + EDGE IMPULSE
// =========================================================
// MIC_SD  -> GPIO12
// MIC_WS  -> GPIO13
// MIC_SCK -> GPIO14
//
// Tombol MIC asli nantinya ada di GPIO41.
// Untuk pengujian sementara, tombol MIC menggunakan SW28.
// =========================================================
#define MIC_I2S_PORT I2S_NUM_1
#define MIC_I2S_BCLK 14
#define MIC_I2S_WS   13
#define MIC_I2S_SD   12
#define MIC_GAIN     4

static int16_t *audioBuffer = nullptr;

const float CONFIDENCE_THRESHOLD = 0.70f;
const int AUDIO_MIC_MULAI = 171;
const int AUDIO_MIC_MATI  = 172;
const unsigned long DURASI_CUE_MIC_MS = 1200;

// =========================================================
// LOGIKA HALAMAN (SESI 1) & MAPPING AUDIO (STATE MACHINE)
// =========================================================
int halamanAktif = 0; // Menyimpan status halaman saat ini (0 sampai 10 mewakili Hal 1-11)

const int TOTAL_HALAMAN = 11;

// 1. Definisikan 11 Pin yang bertindak sebagai Tombol GO (Gunakan indeks global 0-47)
const int pinTombolGo[TOTAL_HALAMAN] = {1, 2, 3, 4, 5, 6, 7, 15, 14, 13, 12}; 

// 2. Audio petunjuk yang diputar saat tombol GO ditekan (Track untuk Hal 1 s/d Hal 11)
const int audioTombolGo[TOTAL_HALAMAN] = {1, 2, 2, 2, 2, 2, 29, 170, 170, 29, 34};

// 3. Matriks Audio Konten (11 Halaman x 48 Pin Global)
// Elemen wajib berjumlah 48 per baris.
const int trackKonten[11][48] = {
  // Halaman 1 (halamanAktif = 0)
  {0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0}, 
  
  // Halaman 2 (Silakan hapus komentar dan lengkapi hingga 48 elemen per baris)
  {0,0,0,0,0,0,0,0, 6, 5, 4, 3, 0,0,0,0, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 0, 27, 28, 0, 0,0,0,0,0,0,0,0},
  // {0,0, ... },

  //halaman 3
  {0,0,0,0,0,0,0,0, 61, 60, 59, 58, 0,0,0,0, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 0,0,0,0,0,0,0,0},

  //halaman 4
  {0,0,0,0,0,0,0,0, 89, 88, 87, 86, 0,0,0,0, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 0,0,0,0,0,0,0,0},

  //halaman 5
  {0,0,0,0,0,0,0,0, 117, 116, 115, 114, 0,0,0,0, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 0,0,0,0,0,0,0,0},

  //halaman 6
  {0,0,0,0,0,0,0,0, 145, 144, 143, 142, 0,0,0,0, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 0,0,0,0,0,0,0,0}
};


// =========================================================
// TANTANGAN BICARA - GO KE-8 = PIN GLOBAL 15
// =========================================================
//
// pinTombolGo:
// {1, 2, 3, 4, 5, 6, 7, 15, 14, 13, 12}
//
// "GO ke-8" adalah elemen ke-8 pada array di atas.
// Karena indeks C++ dimulai dari 0:
//   pinTombolGo[7] = 15
// sehingga halamanAktif untuk Tantangan Bicara = 7.
//
// Tombol kalimat:
//   SW1 -> ini_bima
//   SW3 -> bima_beli_bola
//   SW5 -> bima_ada_bola
//   SW7 -> ada_tiga_bola
//
// Tombol MIC:
//   GPIO 41 -> tombol MIC fisik
// =========================================================

const int HALAMAN_TANTANGAN_BICARA = 7; // pinTombolGo[7] = 15

const int pinTantanganBicara[4] = {
  11,  // SW1 -> ini_bima
  9,   // SW3 -> bima_beli_bola
  16,  // SW5 -> bima_ada_bola
  18   // SW7 -> ada_tiga_bola
};

const char *labelTantanganBicara[4] = {
  "ini_bima",
  "bima_beli_bola",
  "bima_ada_bola",
  "ada_tiga_bola"
};

#define MIC_BUTTON_PIN 41 // Tombol MIC fisik langsung ke GPIO 41

const int MAX_PERCOBAAN_BICARA = 3;
int jumlahPercobaanBicara[4] = {0, 0, 0, 0};
int targetBicaraAktif = -1;

// =========================================================
// LOGIKA KUIS INTERAKTIF (HALAMAN 7, 12, & 14)
// =========================================================
int soalAktif = -1; 
const int AUDIO_BENAR = 30; 
const int AUDIO_SALAH = 31; 

struct KuisInteraktif {
  int pinTombolSoal;      // Pin objek kiri (suku kata pertama)
  int trackAudioSoal;     // Audio suku kata pertama
  int pinTombolJawaban;   // Pin objek kanan (suku kata kedua)
  int trackAudioJawaban;  // [BARU] Audio suku kata kedua 
  int trackAudioGabungan; // [BARU] Audio kata utuh diputar jika pasangan benar 
};

// Pemetaan Halaman 7 (Tambahkan angka 0, 0 di belakangnya agar format sesuai)
const int JUMLAH_SOAL_HAL_7 = 8;
KuisInteraktif soalHalaman7[JUMLAH_SOAL_HAL_7] = {
  {11, 32, 17, 0, 0}, //tombol soal, audio soal, jawaban benar
  {28, 33, 34, 0, 0}, 
  {99, 0, 18, 0, 0},
  {99, 0, 21, 0, 0},
  {99, 0, 22, 0, 0},
  {99, 0, 33, 0, 0},
  {99, 0, 37, 0, 0},
  {99, 0, 38, 0, 0}
};

// Pemetaan Halaman 13
const int JUMLAH_SOAL_HAL_13 = 8;
KuisInteraktif soalHalaman13[JUMLAH_SOAL_HAL_13] = {
  {11, 56, 21, 0, 0}, 
  {28, 57, 38, 0, 0}, 
  {99, 0, 18, 0, 0},
  {99, 0, 17, 0, 0},
  {99, 0, 22, 0, 0},
  {99, 0, 33, 0, 0},
  {99, 0, 37, 0, 0},
  {99, 0, 34, 0, 0}
};

// Pemetaan Halaman 12 (Pencocokan Suku Kata)
const int JUMLAH_SOAL_HAL_12 = 7; 
KuisInteraktif soalHalaman12[JUMLAH_SOAL_HAL_12] = {
  // Misal: Kiri(20)="BU"(160), Kanan(25)="KU"(161), Benar="BUKU"(162)
  {10, 35, 38, 42, 49}, 
  
  // Misal: Kiri(21)="SA"(163), Kanan(26)="PI"(164), Benar="SAPI"(165)
  {17, 36, 9, 43, 50},
  {21, 37, 26, 44, 51},
  {25, 38, 27, 45, 52},
  {29, 39, 34, 46, 53},
  {33, 40, 18, 47, 54},
  {37, 41, 22, 48, 55} 
};


// =========================================================
// FUNGSI TANTANGAN BICARA
// =========================================================


// =========================================================
// PROTOTYPE WIFI
// =========================================================

void startWiFiSystem();
void handleWiFiState();
bool hasSavedWiFi();
bool connectSavedWiFi();
void startFirstTimeWiFiSetup();
void playTrack399();
void playTrack400();
bool micButtonPressed();
void markWiFiConfigured();
void resetWiFiConfiguration();
void sendSession();

void resetTantanganBicara() {
  for (int i = 0; i < 4; i++) {
    jumlahPercobaanBicara[i] = 0;
  }

  targetBicaraAktif = -1;

  Serial.println("Tantangan Bicara di-reset.");
  Serial.println("Pilih kalimat, lalu tekan tombol MIC GPIO 41.");
}

bool initMicrophone() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = EI_CLASSIFIER_FREQUENCY,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = 0,
    .dma_buf_count = 8,
    .dma_buf_len = 512,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = MIC_I2S_BCLK,
    .ws_io_num = MIC_I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = MIC_I2S_SD
  };

  esp_err_t err = i2s_driver_install(
    MIC_I2S_PORT,
    &i2s_config,
    0,
    NULL
  );

  if (err != ESP_OK) {
    Serial.printf("Gagal install I2S. Error: %d\n", (int)err);
    return false;
  }

  err = i2s_set_pin(MIC_I2S_PORT, &pin_config);

  if (err != ESP_OK) {
    Serial.printf("Gagal konfigurasi pin I2S. Error: %d\n", (int)err);
    i2s_driver_uninstall(MIC_I2S_PORT);
    return false;
  }

  i2s_zero_dma_buffer(MIC_I2S_PORT);

  audioBuffer = (int16_t *)malloc(
    EI_CLASSIFIER_RAW_SAMPLE_COUNT * sizeof(int16_t)
  );

  if (audioBuffer == nullptr) {
    Serial.println("Gagal mengalokasikan buffer audio!");
    i2s_driver_uninstall(MIC_I2S_PORT);
    return false;
  }

  Serial.println("Microphone INMP441 + Edge Impulse siap.");
  Serial.printf(
    "Sample rate: %d Hz | Samples: %d | Durasi: %.2f detik\n",
    EI_CLASSIFIER_FREQUENCY,
    EI_CLASSIFIER_RAW_SAMPLE_COUNT,
    (float)EI_CLASSIFIER_RAW_SAMPLE_COUNT /
      (float)EI_CLASSIFIER_FREQUENCY
  );

  return true;
}

bool recordAudio() {
  if (audioBuffer == nullptr) {
    Serial.println("Buffer microphone belum tersedia.");
    return false;
  }

  Serial.println("MIC AKTIF - silakan bicara...");

  i2s_zero_dma_buffer(MIC_I2S_PORT);
  delay(250);

  const size_t CHUNK_SAMPLES = 512;
  static int32_t rawBuffer[CHUNK_SAMPLES];

  size_t totalSamples = 0;

  while (totalSamples < EI_CLASSIFIER_RAW_SAMPLE_COUNT) {
    size_t remaining =
      EI_CLASSIFIER_RAW_SAMPLE_COUNT - totalSamples;

    size_t requestedSamples =
      (remaining > CHUNK_SAMPLES) ? CHUNK_SAMPLES : remaining;

    size_t bytesRead = 0;

    esp_err_t result = i2s_read(
      MIC_I2S_PORT,
      (void *)rawBuffer,
      requestedSamples * sizeof(int32_t),
      &bytesRead,
      portMAX_DELAY
    );

    if (result != ESP_OK) {
      Serial.printf("Gagal membaca microphone. Error: %d\n", (int)result);
      return false;
    }

    size_t samplesRead = bytesRead / sizeof(int32_t);

    for (size_t i = 0; i < samplesRead; i++) {
      int32_t sample = rawBuffer[i] >> 16;
      sample *= MIC_GAIN;

      if (sample > 32767) sample = 32767;
      if (sample < -32768) sample = -32768;

      audioBuffer[totalSamples + i] = (int16_t)sample;
    }

    totalSamples += samplesRead;
  }

  Serial.println("Rekaman selesai.");
  return true;
}

static int microphoneAudioGetData(
  size_t offset,
  size_t length,
  float *out_ptr
) {
  numpy::int16_to_float(
    &audioBuffer[offset],
    out_ptr,
    length
  );

  return 0;
}

bool ujiUcapan(const char *labelTarget) {
  Serial.println();
  Serial.println("======================================");
  Serial.print("Target ucapan : ");
  Serial.println(labelTarget);
  Serial.println("======================================");

  // Hentikan audio yang mungkin masih berjalan.
  myDFPlayer.stop();
  delay(150);

  // Track 171 = tanda microphone akan mulai.
  Serial.println("Track 171 -> MIC MULAI");
  myDFPlayer.playMp3Folder(AUDIO_MIC_MULAI);

  // Tunggu cue selesai supaya tidak ikut terekam.
  delay(DURASI_CUE_MIC_MS);
  myDFPlayer.stop();
  delay(100);

  // Rekam audio.
  bool rekamanBerhasil = recordAudio();

  // Track 172 = tanda microphone selesai/mati.
  Serial.println("Track 172 -> MIC MATI");
  myDFPlayer.playMp3Folder(AUDIO_MIC_MATI);
  delay(DURASI_CUE_MIC_MS);
  myDFPlayer.stop();

  if (!rekamanBerhasil) {
    Serial.println("ERROR: Rekaman gagal.");
    return false;
  }

  signal_t signal;
  signal.total_length = EI_CLASSIFIER_RAW_SAMPLE_COUNT;
  signal.get_data = &microphoneAudioGetData;

  ei_impulse_result_t result = {0};

  Serial.println("Memproses suara dengan Edge Impulse...");

  EI_IMPULSE_ERROR res =
    run_classifier(&signal, &result, false);

  if (res != EI_IMPULSE_OK) {
    Serial.printf("Inference gagal. Error: %d\n", (int)res);
    return false;
  }

  size_t bestIndex = 0;

  Serial.println("Hasil prediksi:");

  for (size_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
    Serial.print("  ");
    Serial.print(result.classification[i].label);
    Serial.print(" = ");
    Serial.println(result.classification[i].value, 4);

    if (
      result.classification[i].value >
      result.classification[bestIndex].value
    ) {
      bestIndex = i;
    }
  }

  const char *detectedLabel =
    result.classification[bestIndex].label;

  float confidence =
    result.classification[bestIndex].value;

  Serial.print("Target      : ");
  Serial.println(labelTarget);

  Serial.print("Terdeteksi  : ");
  Serial.println(detectedLabel);

  Serial.print("Confidence  : ");
  Serial.println(confidence, 4);

  bool benar =
    strcmp(detectedLabel, labelTarget) == 0 &&
    confidence >= CONFIDENCE_THRESHOLD;

  if (benar) {
    Serial.println(">>> UCAPAN BENAR <<<");
  } else {
    Serial.println(">>> UCAPAN BELUM SESUAI <<<");
  }

  return benar;
}

// =========================================================
// TOMBOL MIC FISIK GPIO 41
// =========================================================

void handleMicButtonPress() {

  Serial.println();
  Serial.println("MIC BUTTON GPIO 41 ditekan.");

  if (halamanAktif != HALAMAN_TANTANGAN_BICARA) {

    Serial.println(
      "GPIO 41 diabaikan: bukan halaman Tantangan Bicara."
    );

    return;
  }

  if (
    targetBicaraAktif < 0 ||
    targetBicaraAktif >= 4
  ) {

    Serial.println(
      "Pilih kalimat dahulu: SW1, SW3, SW5, atau SW7."
    );

    return;
  }

  int i = targetBicaraAktif;

  if (
    jumlahPercobaanBicara[i] >=
    MAX_PERCOBAAN_BICARA
  ) {

    Serial.println(
      "Batas 3 percobaan sudah tercapai."
    );

    Serial.println(
      "Tekan GO ke-8 (pin 15) untuk reset."
    );

    return;
  }

  jumlahPercobaanBicara[i]++;

  Serial.printf(
    "Target %s -> Percobaan %d dari %d\n",
    labelTantanganBicara[i],
    jumlahPercobaanBicara[i],
    MAX_PERCOBAAN_BICARA
  );

  bool benar =
    ujiUcapan(
      labelTantanganBicara[i]
    );

  if (benar) {

    Serial.println(
      "Kalimat BENAR."
    );

    myDFPlayer.playMp3Folder(
      AUDIO_BENAR
    );

    jumlahPercobaanBicara[i] = 0;

    targetBicaraAktif = -1;

    Serial.println(
      "Pilih kalimat berikutnya."
    );

  } else {

    Serial.println(
      "Kalimat SALAH."
    );

    myDFPlayer.playMp3Folder(
      AUDIO_SALAH
    );

    int sisa =
      MAX_PERCOBAAN_BICARA -
      jumlahPercobaanBicara[i];

    if (sisa > 0) {

      Serial.printf(
        "Sisa percobaan: %d\n",
        sisa
      );

      Serial.println(
        "Tekan GPIO 41 lagi untuk mencoba."
      );

    } else {

      Serial.println(
        "Percobaan ke-3 gagal."
      );

      Serial.println(
        "Tekan GO ke-8 (pin 15) untuk reset."
      );
    }
  }
}


// =========================================================
// Fungsi Evaluasi Penekanan Tombol
// =========================================================
void handleButtonPress(int pinGlobal) {
  bool isGoButton = false;
  
  // 1. Cek tombol GO
  for (int i = 0; i < TOTAL_HALAMAN; i++) {
    if (pinGlobal == pinTombolGo[i]) {
      halamanAktif = i; 
      soalAktif = -1; 
      Serial.printf("Tombol GO %d ditekan. Masuk ke Halaman Indeks %d\n", pinGlobal, halamanAktif);
      myDFPlayer.playMp3Folder(audioTombolGo[i]); 

      // GO ke-8 = pinTombolGo[7] = 15 -> Tantangan Bicara.
      if (i == HALAMAN_TANTANGAN_BICARA) {
        resetTantanganBicara();
      }

      isGoButton = true;
      break;
    }
  }

  if (isGoButton) return; 

  // =====================================================
  // 2. TANTANGAN BICARA
  // GO ke-8 = pin 15 = halamanAktif indeks 7
  // =====================================================
  if (halamanAktif == HALAMAN_TANTANGAN_BICARA) {

    // A. SW1/SW3/SW5/SW7 hanya memilih kalimat target.
    for (int i = 0; i < 4; i++) {
      if (pinGlobal == pinTantanganBicara[i]) {
        targetBicaraAktif = i;

        Serial.println();
        Serial.print("Kalimat dipilih: ");
        Serial.println(labelTantanganBicara[i]);

        if (jumlahPercobaanBicara[i] >= MAX_PERCOBAAN_BICARA) {
          Serial.println("Batas 3 percobaan untuk kalimat ini sudah tercapai.");
          Serial.println("Tekan GO ke-8 (pin 15) untuk reset.");
        } else {
          Serial.printf(
            "Percobaan terpakai: %d/%d\n",
            jumlahPercobaanBicara[i],
            MAX_PERCOBAAN_BICARA
          );
          Serial.println("Tekan SW28 untuk mulai merekam.");
        }

        return;
      }
    }

    // B. Tombol MIC sekarang menggunakan GPIO 41.
    // Pemrosesannya dilakukan di loop() melalui
    // handleMicButtonPress().
  }

  // 3. Cek Kuis (Indeks 6 = Hal 7, Indeks 10 = Hal 12, Indeks 9 = Hal 13)
  if (halamanAktif == 6 || halamanAktif == 10 || halamanAktif == 9) {
    
    KuisInteraktif* daftarSoal;
    int jumlahSoal;

    if (halamanAktif == 6) {
      daftarSoal = soalHalaman7;
      jumlahSoal = JUMLAH_SOAL_HAL_7;
    } else if (halamanAktif == 10) { 
      daftarSoal = soalHalaman12;
      jumlahSoal = JUMLAH_SOAL_HAL_12;
    } else { 
      daftarSoal = soalHalaman13;
      jumlahSoal = JUMLAH_SOAL_HAL_13;
    }
    
    // Variabel ini yang sebelumnya hilang (wajib ada di sini)
    bool isTombolSoal = false; 

    // A. Cek penekanan Sisi Kiri (Suku Kata Pertama)
    for (int i = 0; i < jumlahSoal; i++) {
      if (pinGlobal == daftarSoal[i].pinTombolSoal) {
        soalAktif = i; 
        if (daftarSoal[i].trackAudioSoal != 0) {
          Serial.printf("Kiri Dipilih -> Putar Audio %d\n", daftarSoal[i].trackAudioSoal);
          myDFPlayer.playMp3Folder(daftarSoal[i].trackAudioSoal);
        }
        isTombolSoal = true;
        break;
      }
    }

    // B. Cek penekanan Sisi Kanan (Suku Kata Kedua)
    if (!isTombolSoal) {
      int indeksJawaban = -1;
      
      // Filter apakah pin yang ditekan termasuk dalam daftar tombol kanan
      for (int j = 0; j < jumlahSoal; j++) {
        if (pinGlobal == daftarSoal[j].pinTombolJawaban) {
          indeksJawaban = j;
          break;
        }
      }

      if (indeksJawaban != -1) { 
        // Putar audio suku kata kedua (jika ada)
        if (daftarSoal[indeksJawaban].trackAudioJawaban != 0) {
          Serial.printf("Kanan Dipilih -> Putar Audio %d\n", daftarSoal[indeksJawaban].trackAudioJawaban);
          myDFPlayer.playMp3Folder(daftarSoal[indeksJawaban].trackAudioJawaban);
        }

        // Evaluasi pasangan
        if (soalAktif != -1) { 
          
          if (daftarSoal[indeksJawaban].trackAudioJawaban != 0) {
            delay(1000); 
          }

          if (pinGlobal == daftarSoal[soalAktif].pinTombolJawaban) {
            Serial.println("Pasangan BENAR!");
            if (daftarSoal[soalAktif].trackAudioGabungan != 0) {
              myDFPlayer.playMp3Folder(daftarSoal[soalAktif].trackAudioGabungan);
            } else {
              myDFPlayer.playMp3Folder(AUDIO_BENAR);
            }
            soalAktif = -1; // Reset memori
          } else {
            Serial.println("Pasangan SALAH!");
            myDFPlayer.playMp3Folder(AUDIO_SALAH);
          }
        } else {
          Serial.println("Suku kata kanan ditekan mandiri (tanpa menekan suku kata kiri)");
        }
      }
    }

  } else {
    // 3. Mode Matriks Normal
    int trackTujuan = trackKonten[halamanAktif][pinGlobal];
    if (trackTujuan != 0) {
      Serial.printf("Pin %d di Halaman %d ditekan -> Putar Track %d\n", pinGlobal, halamanAktif + 1, trackTujuan);
      myDFPlayer.playMp3Folder(trackTujuan);
    }
  }
}

// =========================================================
// Fungsi Pembacaan Sensor PCF8575 & Edge Detection
// =========================================================
uint16_t readPCFHardware(TwoWire &wireBus, uint8_t address) {
  uint16_t data = 0xFFFF;
  wireBus.requestFrom(address, (uint8_t)2);
  if (wireBus.available() == 2) {
    data = wireBus.read();
    data |= (wireBus.read() << 8);
  }
  return data;
}

// Fungsi pembacaan khusus untuk library BitBang_I2C
uint16_t readPCFBitBang(BBI2C *bbi2c, uint8_t address) {
  uint8_t data[2];
  // I2CRead mereturn 1 jika sukses membaca, 0 jika gagal
  if (I2CRead(bbi2c, address, data, 2)) {
    uint16_t result = data[0];
    result |= (data[1] << 8);
    return result;
  }
  return 0xFFFF; // Return HIGH (tidak ada tombol ditekan) jika gagal baca
}

void checkPCF(uint16_t currentState, uint16_t &lastState, int offsetPin) {
  for (int i = 0; i < 16; i++) {
    if (bitRead(currentState, i) == LOW && bitRead(lastState, i) == HIGH) {
      handleButtonPress(offsetPin + i); 
      delay(50); 
    }
  }
  lastState = currentState;
}

// =========================================================
// WIFI FUNCTIONS
// =========================================================

bool hasSavedWiFi() {

  wifiPreferences.begin(
    "lingo-wifi",
    true
  );

  bool configured =
    wifiPreferences.getBool(
      "configured",
      false
    );

  wifiPreferences.end();

  return configured;
}


void markWiFiConfigured() {

  wifiPreferences.begin(
    "lingo-wifi",
    false
  );

  wifiPreferences.putBool(
    "configured",
    true
  );

  wifiPreferences.end();
}


void resetWiFiConfiguration() {

  wifiPreferences.begin(
    "lingo-wifi",
    false
  );

  wifiPreferences.clear();

  wifiPreferences.end();

  wm.resetSettings();

  Serial.println(
    "Konfigurasi WiFi LINGO dihapus."
  );
}


bool connectSavedWiFi() {

  Serial.println();
  Serial.println(
    "Mencoba WiFi tersimpan..."
  );

  WiFi.mode(
    WIFI_STA
  );

  WiFi.begin();

  unsigned long startTime =
    millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - startTime <
      WIFI_CONNECT_TIMEOUT
  ) {

    delay(500);

    Serial.print(".");
  }

  Serial.println();

  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    Serial.println(
      "WiFi berhasil terhubung."
    );

    Serial.print(
      "SSID: "
    );

    Serial.println(
      WiFi.SSID()
    );

    Serial.print(
      "IP: "
    );

    Serial.println(
      WiFi.localIP()
    );

    return true;
  }

  return false;
}


void startFirstTimeWiFiSetup() {

  Serial.println();
  Serial.println(
    "======================================"
  );

  Serial.println(
    "       FIRST TIME WIFI SETUP"
  );

  Serial.println(
    "======================================"
  );

  Serial.println(
    "Hubungkan HP ke hotspot:"
  );

  Serial.println(
    "LINGO_SETUP"
  );

  Serial.println(
    "Track 399 akan diputar berulang."
  );

  wm.setConfigPortalBlocking(
    false
  );

  wm.setConfigPortalTimeout(
    0
  );

  bool result =
    wm.startConfigPortal(
      "LINGO_SETUP"
    );

  if (!result) {

    Serial.println(
      "Config portal gagal dimulai."
    );
  }

  lastWifiAudio =
    millis() -
    WIFI_AUDIO_INTERVAL;
}


void startWiFiSystem() {

  if (
    hasSavedWiFi()
  ) {

    Serial.println(
      "WiFi tersimpan ditemukan."
    );

    wifiState =
      WIFI_CONNECTING;

    if (
      connectSavedWiFi()
    ) {

      markWiFiConfigured();

      wifiState =
        WIFI_ONLINE;

      lingoReady =
        true;

    } else {

      wifiState =
        WIFI_FAILED;

      lingoReady =
        false;

      lastWifiAudio =
        millis() -
        WIFI_AUDIO_INTERVAL;
    }

  } else {

    wifiState =
      WIFI_FIRST_SETUP;

    lingoReady =
      false;

    startFirstTimeWiFiSetup();
  }
}


void playTrack399() {

  if (
    millis() - lastWifiAudio >=
    WIFI_AUDIO_INTERVAL
  ) {

    Serial.println(
      "PLAY TRACK 399"
    );

    myDFPlayer.playMp3Folder(
      TRACK_WIFI_SETUP
    );

    lastWifiAudio =
      millis();
  }
}


void playTrack400() {

  if (
    millis() - lastWifiAudio >=
    WIFI_AUDIO_INTERVAL
  ) {

    Serial.println(
      "PLAY TRACK 400"
    );

    myDFPlayer.playMp3Folder(
      TRACK_WIFI_FAILED
    );

    lastWifiAudio =
      millis();
  }
}


bool micButtonPressed() {

  static bool lastButtonState =
    HIGH;

  bool currentState =
    digitalRead(
      MIC_BUTTON_PIN
    );

  bool pressed =
    (
      lastButtonState == HIGH &&
      currentState == LOW
    );

  lastButtonState =
    currentState;

  return pressed;
}


void handleWiFiState() {

  switch (
    wifiState
  ) {

    case WIFI_FIRST_SETUP:

      wm.process();

      playTrack399();

      if (
        WiFi.status() ==
        WL_CONNECTED
      ) {

        Serial.println();
        Serial.println(
          "WiFi pertama berhasil terhubung."
        );

        Serial.print(
          "SSID: "
        );

        Serial.println(
          WiFi.SSID()
        );

        Serial.print(
          "IP: "
        );

        Serial.println(
          WiFi.localIP()
        );

        markWiFiConfigured();

        wifiState =
          WIFI_ONLINE;

        lingoReady =
          true;

        Serial.println(
          "LINGO READY - ONLINE"
        );

        myDFPlayer.playMp3Folder(
          0
        );
      }

      break;


    case WIFI_CONNECTING:

      break;


    case WIFI_ONLINE:

      if (
        WiFi.status() !=
        WL_CONNECTED
      ) {

        Serial.println(
          "WiFi terputus."
        );

        wifiState =
          WIFI_FAILED;

        lingoReady =
          false;

        lastWifiAudio =
          millis() -
          WIFI_AUDIO_INTERVAL;
      }

      break;


    case WIFI_FAILED:

      if (
        WiFi.status() ==
        WL_CONNECTED
      ) {

        Serial.println(
          "WiFi kembali terhubung."
        );

        wifiState =
          WIFI_ONLINE;

        lingoReady =
          true;

        Serial.println(
          "LINGO READY - ONLINE"
        );

        break;
      }

      playTrack400();

      // GPIO 41 = pilihan OFFLINE
      if (
        micButtonPressed()
      ) {

        Serial.println();
        Serial.println(
          "======================================"
        );

        Serial.println(
          "GPIO 41 -> OFFLINE MODE"
        );

        Serial.println(
          "======================================"
        );

        wifiState =
          WIFI_OFFLINE;

        lingoReady =
          true;

        myDFPlayer.playMp3Folder(
          0
        );
      }

      break;


    case WIFI_OFFLINE:

      // Pada STEP berikutnya, hasil permainan
      // akan disimpan ke LittleFS.

      if (
        WiFi.status() ==
        WL_CONNECTED
      ) {

        Serial.println(
          "WiFi kembali tersedia."
        );

        wifiState =
          WIFI_ONLINE;

        lingoReady =
          true;

        Serial.println(
          "LINGO READY - ONLINE"
        );

        // uploadOfflineSessions();
      }

      break;
  }
}


// =========================================================
// SEND SESSION
// =========================================================

void sendSession() {

  if (
    WiFi.status() !=
    WL_CONNECTED
  ) {

    Serial.println(
      "Upload dibatalkan: WiFi tidak terhubung."
    );

    return;
  }

  HTTPClient http;

  http.begin(
    serverURL
  );

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  StaticJsonDocument<300>
    doc;

  doc["user_id"] =
    "BIMA001";

  doc["device_id"] =
    "LINGO001";

  doc["module"] =
    "Tantangan Bicara";

  doc["correct"] =
    18;

  doc["wrong"] =
    2;

  doc["accuracy"] =
    90;

  doc["duration"] =
    600;

  String json;

  serializeJson(
    doc,
    json
  );

  Serial.println();
  Serial.println(
    "Sending session:"
  );

  Serial.println(
    json
  );

  int code =
    http.POST(
      json
    );

  Serial.print(
    "HTTP: "
  );

  Serial.println(
    code
  );

  if (
    code > 0
  ) {

    String response =
      http.getString();

    Serial.println(
      "Server response:"
    );

    Serial.println(
      response
    );
  }

  http.end();
}


// =========================================================
// Main Setup & Loop
// =========================================================

void setup() {

  Serial.begin(
    115200
  );

  delay(1000);


  // ========================================================
  // GPIO 41 = MIC BUTTON
  // ========================================================

  pinMode(
    MIC_BUTTON_PIN,
    INPUT_PULLUP
  );


  Serial.println();
  Serial.println(
    "========================================"
  );

  Serial.println(
    "          LINGO ESP32 START"
  );

  Serial.println(
    "========================================"
  );


  // ========================================================
  // 1. INISIALISASI HARDWARE I2C
  // ========================================================

  Wire.begin(
    SDA_1,
    SCL_1
  );

  Wire1.begin(
    SDA_2,
    SCL_2
  );


  // ========================================================
  // 2. BITBANG I2C
  // ========================================================

  memset(
    &myWire3,
    0,
    sizeof(myWire3)
  );

  myWire3.bWire =
    0;

  myWire3.iSDA =
    SDA_3;

  myWire3.iSCL =
    SCL_3;

  I2CInit(
    &myWire3,
    100000L
  );


  // ========================================================
  // 3. SET PCF8575 SEBAGAI INPUT
  // ========================================================

  Wire.beginTransmission(
    PCF_ADDR
  );

  Wire.write(0xFF);
  Wire.write(0xFF);

  Wire.endTransmission();


  Wire1.beginTransmission(
    PCF_ADDR
  );

  Wire1.write(0xFF);
  Wire1.write(0xFF);

  Wire1.endTransmission();


  uint8_t initData[2] =
    {0xFF, 0xFF};

  I2CWrite(
    &myWire3,
    PCF_ADDR,
    initData,
    2
  );


  // ========================================================
  // 4. INISIALISASI DFPLAYER
  // ========================================================

  mySerial.begin(
    9600,
    SERIAL_8N1,
    DF_RX,
    DF_TX
  );

  if (
    !myDFPlayer.begin(
      mySerial
    )
  ) {

    Serial.println(
      "Gagal terhubung ke DFPlayer!"
    );

    while (true) {
      delay(1000);
    }
  }

  myDFPlayer.volume(
    25
  );

  Serial.println(
    "DFPlayer siap."
  );


  // ========================================================
  // 5. MICROPHONE + EDGE IMPULSE
  // ========================================================

  if (
    !initMicrophone()
  ) {

    Serial.println(
      "Microphone / Edge Impulse gagal diinisialisasi!"
    );

    while (true) {
      delay(1000);
    }
  }


  // ========================================================
  // 6. WIFI
  // ========================================================

  startWiFiSystem();


  // Jika sudah online, handleWiFiState()
  // akan membuat LINGO READY.
}


void loop() {

  // ========================================================
  // 1. WIFI STATE
  // ========================================================

  handleWiFiState();


  // ========================================================
  // 2. SERIAL COMMAND
  // ========================================================

  if (
    Serial.available()
  ) {

    char command =
      Serial.read();


    // --------------------------------------------
    // r = RESET WIFI
    // --------------------------------------------

    if (
      command == 'r'
    ) {

      Serial.println(
        "Reset WiFi..."
      );

      resetWiFiConfiguration();

      delay(1000);

      ESP.restart();
    }


    // --------------------------------------------
    // s = STATUS
    // --------------------------------------------

    if (
      command == 's'
    ) {

      Serial.println();
      Serial.println(
        "========== LINGO STATUS =========="
      );

      Serial.print(
        "WiFi state: "
      );

      switch (wifiState) {

        case WIFI_FIRST_SETUP:
          Serial.println("FIRST_SETUP");
          break;

        case WIFI_CONNECTING:
          Serial.println("CONNECTING");
          break;

        case WIFI_ONLINE:
          Serial.println("ONLINE");
          break;

        case WIFI_FAILED:
          Serial.println("FAILED");
          break;

        case WIFI_OFFLINE:
          Serial.println("OFFLINE");
          break;
      }

      Serial.print(
        "WiFi: "
      );

      Serial.println(
        WiFi.status() ==
          WL_CONNECTED
          ? "CONNECTED"
          : "NOT CONNECTED"
      );

      Serial.print(
        "SSID: "
      );

      Serial.println(
        WiFi.SSID()
      );

      Serial.print(
        "IP: "
      );

      Serial.println(
        WiFi.localIP()
      );

      Serial.print(
        "LINGO Ready: "
      );

      Serial.println(
        lingoReady
          ? "YES"
          : "NO"
      );

      Serial.println(
        "================================="
      );
    }
  }


  // ========================================================
  // 3. GPIO 41 MIC BUTTON
  // ========================================================
  //
  // Ketika WIFI_FAILED:
  //   GPIO 41 = pilih OFFLINE
  //
  // Ketika LINGO READY:
  //   GPIO 41 = MIC Tantangan Bicara
  //
  // ========================================================

  if (
    lingoReady &&
    wifiState != WIFI_FAILED &&
    wifiState != WIFI_FIRST_SETUP &&
    micButtonPressed()
  ) {

    handleMicButtonPress();
  }


  // ========================================================
  // 4. BACA PCF8575
  // ========================================================

  if (
    !lingoReady
  ) {

    delay(20);

    return;
  }


  uint16_t state1 =
    readPCFHardware(
      Wire,
      PCF_ADDR
    );

  uint16_t state2 =
    readPCFHardware(
      Wire1,
      PCF_ADDR
    );

  uint16_t state3 =
    readPCFBitBang(
      &myWire3,
      PCF_ADDR
    );


  if (
    state1 != lastState1
  ) {

    checkPCF(
      state1,
      lastState1,
      0
    );
  }


  if (
    state2 != lastState2
  ) {

    checkPCF(
      state2,
      lastState2,
      16
    );
  }


  if (
    state3 != lastState3
  ) {

    checkPCF(
      state3,
      lastState3,
      32
    );
  }


  delay(20);
}


#if !defined(EI_CLASSIFIER_SENSOR) || \
    EI_CLASSIFIER_SENSOR != EI_CLASSIFIER_SENSOR_MICROPHONE
#error "Model Edge Impulse yang dipasang bukan model microphone."
#endif
