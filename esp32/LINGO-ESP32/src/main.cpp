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
#include <lingo_speech_inferencing.h>
#include "driver/i2s.h"
#include <string.h>
#include <math.h>
#include "esp_heap_caps.h"

#ifndef LINGO_WIFI_ENABLED
#define LINGO_WIFI_ENABLED 0
#endif

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
// Tombol MIC fisik menggunakan GPIO41.
// =========================================================
#define MIC_I2S_PORT I2S_NUM_1
#define MIC_I2S_BCLK 14
#define MIC_I2S_WS   13
#define MIC_I2S_SD   12
#define MIC_GAIN     4

static int16_t *audioBuffer = nullptr;

// Memeriksa BANYAK jendela meningkatkan peluang salah-terima.
// Mulai dengan ambang 0.85, lalu kalibrasi menggunakan kata target,
// hard-negative dan noise yang direkam dengan mikrofon INMP441.
const float CONFIDENCE_THRESHOLD = 0.75f;
const size_t LINGO_SPEECH_SAMPLE_COUNT = 16000; // 1 detik per inferensi
const int LINGO_SPEECH_SAMPLE_RATE = 16000;
const int AUDIO_MIC_MULAI = 171;
const int AUDIO_MIC_MATI  = 172;
const unsigned long DURASI_CUE_MIC_MS = 1200;
const size_t MIC_MIN_VALID_SAMPLES = 2400; // 150 ms, hindari klik tombol
const size_t MIC_MAX_RECORD_SAMPLES = 5 * LINGO_SPEECH_SAMPLE_COUNT; // 5 detik
const size_t MIC_WINDOW_HOP_SAMPLES = 4000; // 250 ms / overlap 75%
// Suara mulai (171) diputar saat memilih kata / siap mengulang,
// SEBELUM tombol ditekan. Suara mati (172) diputar setelah tombol dilepas.
// Jangan memutar petunjuk audio selagi microphone mengambil sampel.
static int16_t *recordingBuffer = nullptr; // seluruh audio dalam PSRAM
static size_t recordedAudioSamples = 0;


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
//   SW3 -> lula_beli_buku
//   SW5 -> bima_ada_bola
//   SW7 -> tiga_buku_baru
//
// Tombol MIC:
//   GPIO 41 -> tombol MIC fisik
// =========================================================

const int HALAMAN_TANTANGAN_BICARA = 7; // pinTombolGo[7] = 15

const int pinTantanganBicara[4] = {
  11,  // SW1 -> ini_bima
  9,   // SW3 -> lula_beli_buku
  16,  // SW5 -> bima_ada_bola
  18   // SW7 -> tiga_buku_baru
};

const char *labelTantanganBicara[4] = {
  "i-tu",
  "a-ku",
  "bi-ma",
  "lu-la"
};

const char *modelLabelTantanganBicara[4] = {
  "itu",
  "aku",
  "bima",
  "lula"
};

const LingoSpeechModel modelTantanganBicara[4] = {
  LINGO_MODEL_ITU,
  LINGO_MODEL_AKU,
  LINGO_MODEL_BIMA,
  LINGO_MODEL_LULA
};

#define MIC_BUTTON_PIN 41 // Tombol MIC fisik langsung ke GPIO 41

const int MAX_PERCOBAAN_BICARA = 3;
int jumlahPercobaanBicara[4] = {0, 0, 0, 0};
int targetBicaraAktif = -1;

// =========================================================
// LOGIKA KUIS INTERAKTIF
// =========================================================
int soalAktif = -1; 
const int AUDIO_BENAR = 30; 
const int AUDIO_SALAH = 31; 

// Urutan halaman mengikuti urutan tombol GO.
const int HALAMAN_MISI_JUARA_1 = 6;
const int HALAMAN_MISI_JUARA_2 = 9;
const int HALAMAN_MENCOCOKKAN_SUKU_KATA = 10;
const unsigned long DURASI_AUDIO_KANAN_MENCOCOKKAN_MS = 1000;

struct KuisInteraktif {
  int pinTombolSoal;      // Pin objek kiri (suku kata pertama)
  int trackAudioSoal;     // Audio suku kata pertama
  int pinTombolJawaban;   // Pin objek kanan (suku kata kedua)
  int trackAudioJawaban;  // [BARU] Audio suku kata kedua 
  int trackAudioGabungan; // [BARU] Audio kata utuh diputar jika pasangan benar 
};

// Misi Juara 1: dua kata/kalimat target dan empat pilihan untuk masing-masing.
const int JUMLAH_SOAL_MISI_JUARA_1 = 8;
KuisInteraktif soalMisiJuara1[JUMLAH_SOAL_MISI_JUARA_1] = {
  {11, 32, 17, 0, 0},
  {28, 33, 34, 0, 0},
  {99, 0, 18, 0, 0},
  {99, 0, 21, 0, 0},
  {99, 0, 22, 0, 0},
  {99, 0, 33, 0, 0},
  {99, 0, 37, 0, 0},
  {99, 0, 38, 0, 0}
};

// Misi Juara 2: dua kata/kalimat target dan empat pilihan untuk masing-masing.
const int JUMLAH_SOAL_MISI_JUARA_2 = 8;
KuisInteraktif soalMisiJuara2[JUMLAH_SOAL_MISI_JUARA_2] = {
  {11, 56, 21, 0, 0}, 
  {28, 57, 38, 0, 0}, 
  {99, 0, 18, 0, 0},
  {99, 0, 17, 0, 0},
  {99, 0, 22, 0, 0},
  {99, 0, 33, 0, 0},
  {99, 0, 37, 0, 0},
  {99, 0, 34, 0, 0}
};

// Misi Mencocokkan Suku Kata.
const int JUMLAH_SOAL_MENCOCOKKAN = 7;
KuisInteraktif soalMencocokkan[JUMLAH_SOAL_MENCOCOKKAN] = {
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
void enterOfflineMode();

void resetTantanganBicara() {
  for (int i = 0; i < 4; i++) {
    jumlahPercobaanBicara[i] = 0;
  }

  targetBicaraAktif = -1;

  Serial.println("Tantangan Bicara di-reset.");
  Serial.println("Pilih kalimat, lalu tekan tombol MIC GPIO 41.");
}

bool initMicrophone() {
  Serial.printf("[MEM] PSRAM detected=%s | free=%u bytes | heap internal=%u bytes\n",
                psramFound() ? "YES" : "NO",
                (unsigned)ESP.getFreePsram(),
                (unsigned)ESP.getFreeHeap());
  if (!psramFound()) {
    Serial.println("[MEM] ERROR: ESP32-S3 N16R8 membutuhkan PSRAM OPI aktif untuk model EON.");
    return false;
  }

  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = LINGO_SPEECH_SAMPLE_RATE,
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

  const size_t audioBufferBytes =
    LINGO_SPEECH_SAMPLE_COUNT * sizeof(int16_t);

  // Gunakan PSRAM N16R8 untuk buffer audio jika tersedia agar heap internal
  // tetap tersedia untuk WiFi dan proses inferensi.
  audioBuffer = psramFound()
    ? (int16_t *)ps_malloc(audioBufferBytes)
    : (int16_t *)malloc(audioBufferBytes);

  if (audioBuffer == nullptr) {
    Serial.println("Gagal mengalokasikan buffer audio 1 detik!");
    i2s_driver_uninstall(MIC_I2S_PORT);
    return false;
  }

  recordingBuffer = (int16_t *)heap_caps_malloc(
    MIC_MAX_RECORD_SAMPLES * sizeof(int16_t),
    MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT
  );
  if (recordingBuffer == nullptr) {
    Serial.println("Gagal mengalokasikan buffer rekaman 5 detik di PSRAM!");
    free(audioBuffer);
    audioBuffer = nullptr;
    i2s_driver_uninstall(MIC_I2S_PORT);
    return false;
  }

  Serial.printf("[MIC] Buffer rekaman %u byte di PSRAM | free PSRAM=%u\n",
                (unsigned)(MIC_MAX_RECORD_SAMPLES * sizeof(int16_t)),
                (unsigned)ESP.getFreePsram());
  Serial.println("Microphone INMP441 + Edge Impulse siap.");
  Serial.printf(
    "Sample rate: %d Hz | Samples: %d | Durasi: %.2f detik\n",
    LINGO_SPEECH_SAMPLE_RATE,
    LINGO_SPEECH_SAMPLE_COUNT,
    (float)LINGO_SPEECH_SAMPLE_COUNT /
      (float)LINGO_SPEECH_SAMPLE_RATE
  );

  return true;
}

// Suara 171 berarti siap merekam. Diputar SEBELUM tombol MIC ditekan
// untuk mencegah anak bicara saat audio cue terdengar dan terekam.
void playMicReadyCue() {
  Serial.println("Track 171 -> MIC MULAI / SIAP");
  myDFPlayer.stop();
  delay(60);
  myDFPlayer.playMp3Folder(AUDIO_MIC_MULAI);
  delay(DURASI_CUE_MIC_MS);
  myDFPlayer.stop();
  Serial.println("[MIC] SIAP. Tekan GPIO 41, bicara, lalu LEPAS.");
}

// Suara 172 hanya diputar SESUDAH semua sampel terkumpul.
void playMicOffCue() {
  Serial.println("Track 172 -> MIC MATI");
  myDFPlayer.stop();
  delay(60);
  myDFPlayer.playMp3Folder(AUDIO_MIC_MATI);
  delay(DURASI_CUE_MIC_MS);
  myDFPlayer.stop();
}

bool recordAudioWhileHeld() {
  recordedAudioSamples = 0;
  if (audioBuffer == nullptr || recordingBuffer == nullptr) {
    Serial.println("[MIC] Buffer audio belum dialokasikan.");
    return false;
  }
  if (digitalRead(MIC_BUTTON_PIN) != HIGH) {
    Serial.println("[MIC] Tombol sudah dilepas sebelum perekaman mulai.");
    return false;
  }

  Serial.println("[MIC] Rekam SELURUH ucapan: tekan -> bicara -> lepas (maks. 5 dtk).");
  i2s_zero_dma_buffer(MIC_I2S_PORT);

  // Per blok <= 256 sampel agar pelepasan tombol cepat tertangkap.
  const size_t CHUNK_SAMPLES = 256;
  static int32_t rawBuffer[CHUNK_SAMPLES];
  uint32_t lastAudioMillis = millis();
  size_t clippedSamples = 0;
  bool readError = false;

  while (digitalRead(MIC_BUTTON_PIN) == HIGH &&
         recordedAudioSamples < MIC_MAX_RECORD_SAMPLES) {
    const size_t remain = MIC_MAX_RECORD_SAMPLES - recordedAudioSamples;
    const size_t request = remain < CHUNK_SAMPLES ? remain : CHUNK_SAMPLES;
    size_t bytesRead = 0;
    esp_err_t result = i2s_read(
      MIC_I2S_PORT, rawBuffer, request * sizeof(int32_t),
      &bytesRead, pdMS_TO_TICKS(40)
    );
    if (result != ESP_OK && result != ESP_ERR_TIMEOUT) {
      Serial.printf("[MIC] I2S error=%d\n", (int)result);
      readError = true;
      break;
    }

    const size_t got = bytesRead / sizeof(int32_t);
    if (got > request) {
      Serial.println("[MIC] I2S returned too many samples. Abort.");
      readError = true;
      break;
    }
    for (size_t i = 0; i < got; ++i) {
      int32_t sample = rawBuffer[i] >> 16;
      sample *= MIC_GAIN;
      if (sample > 32767) { sample = 32767; ++clippedSamples; }
      if (sample < -32768) { sample = -32768; ++clippedSamples; }
      recordingBuffer[recordedAudioSamples++] = (int16_t)sample;
    }
    if (got != 0) lastAudioMillis = millis();
    else if (millis() - lastAudioMillis > 500) {
      Serial.println("[MIC] Timeout INMP441: sampel tidak masuk.");
      readError = true;
      break;
    }
  }

  // Bila batas 5 detik tercapai, hentikan dan tunggu tombol dilepas
  // agar tidak memicu percobaan ganda. Semuanya tetap tersimpan.
  const bool hitLimit = recordedAudioSamples == MIC_MAX_RECORD_SAMPLES;
  if (hitLimit) Serial.println("[MIC] Maksimum 5 detik tercapai; perekaman berhenti.");
  while (digitalRead(MIC_BUTTON_PIN) == HIGH) delay(5);

  if (readError) return false;
  if (recordedAudioSamples < MIC_MIN_VALID_SAMPLES) {
    Serial.printf("[MIC] Terlalu singkat: %u sampel (minimum %u).\n",
                  (unsigned)recordedAudioSamples,
                  (unsigned)MIC_MIN_VALID_SAMPLES);
    return false;
  }

  int32_t peak = 0;
  uint64_t sumSq = 0;
  size_t nonzero = 0;
  for (size_t i = 0; i < recordedAudioSamples; i++) {
    const int32_t val = (int32_t)recordingBuffer[i];
    const int32_t ab = val < 0 ? -val : val;
    if (ab > peak) peak = ab;
    if (ab > 200) ++nonzero;
    sumSq += (uint64_t)((int64_t)val * val);
  }
  const float rms = sqrtf((float)((double)sumSq / (double)recordedAudioSamples));
  Serial.printf("[MIC] Tersimpan %u sampel | durasi=%.3f detik | RMS=%.1f Peak=%ld Nonzero=%u Clip=%u\n",
                (unsigned)recordedAudioSamples,
                (float)recordedAudioSamples / (float)LINGO_SPEECH_SAMPLE_RATE,
                rms, (long)peak, (unsigned)nonzero, (unsigned)clippedSamples);
  if (peak < 300) Serial.println("[MIC] PERINGATAN: suara sangat lemah, periksa INMP441.");
  if (clippedSamples > recordedAudioSamples / 100)
    Serial.println("[MIC] PERINGATAN: clipping, turunkan MIC_GAIN.");

#if defined(LINGO_EI_HEAP_DIAGNOSTICS) && LINGO_EI_HEAP_DIAGNOSTICS
  if (!heap_caps_check_integrity_all(true)) {
    Serial.println("[HEAP-FAULT] Sesudah recording sebelum EI");
    Serial.flush();
    abort();
  }
  Serial.println("[HEAP-OK] Audio recorded (before EI)");
#endif
  return true;
}

// Buat satu input persis 1 detik untuk model MFE.
// Untuk rekaman pendek, pusatkan ucapan dan isi sampel sisanya dengan nol.
void prepareInferenceWindow(size_t offset) {
  memset(audioBuffer, 0, LINGO_SPEECH_SAMPLE_COUNT * sizeof(int16_t));
  if (recordedAudioSamples < LINGO_SPEECH_SAMPLE_COUNT) {
    const size_t pad = (LINGO_SPEECH_SAMPLE_COUNT - recordedAudioSamples) / 2;
    memcpy(audioBuffer + pad, recordingBuffer,
           recordedAudioSamples * sizeof(int16_t));
  } else {
    memcpy(audioBuffer, recordingBuffer + offset,
           LINGO_SPEECH_SAMPLE_COUNT * sizeof(int16_t));
  }
}

// Jalankan inferensi di SELURUH rekaman, bukan satu detik terakhir.
// Jika ada SATU jendela dengan target dan confidence >= batas, langsung BENAR.
// Periksa hingga jendela terakhir walaupun offset-nya tidak kelipatan 250ms.
bool recognizeAcrossRecording(
  LingoSpeechModel model, const char *target,
  bool *inferenceSucceeded
) {
  if (inferenceSucceeded) *inferenceSucceeded = false;
  if (recordedAudioSamples < MIC_MIN_VALID_SAMPLES) return false;

  const size_t lastStart = (recordedAudioSamples > LINGO_SPEECH_SAMPLE_COUNT)
    ? recordedAudioSamples - LINGO_SPEECH_SAMPLE_COUNT : 0;

  size_t offset = 0;
  size_t windowsChecked = 0;
  float highestTargetConfidence = 0.0f;
  bool checkedLast = false;

  while (true) {
    prepareInferenceWindow(offset);
    const char *predicted = nullptr;
    float confidence = 0.0f;
    const bool ok = lingoRecognize(
      model, audioBuffer, LINGO_SPEECH_SAMPLE_COUNT,
      &predicted, &confidence
    );
    if (!ok || predicted == nullptr) {
      Serial.println("[EI] Gagal inferensi window; tidak akan menyatakan BENAR.");
      if (inferenceSucceeded) *inferenceSucceeded = false;
      return false;
    }
    if (inferenceSucceeded) *inferenceSucceeded = true;
    ++windowsChecked;

    const bool isTarget = strcmp(predicted, target) == 0;
    if (isTarget && confidence > highestTargetConfidence)
      highestTargetConfidence = confidence;

    Serial.printf("[EI] Window %u: %.2f-%.2f s | %s = %.4f | target=%s\n",
                  (unsigned)windowsChecked,
                  (float)offset / LINGO_SPEECH_SAMPLE_RATE,
                  (float)(offset + LINGO_SPEECH_SAMPLE_COUNT) / LINGO_SPEECH_SAMPLE_RATE,
                  predicted, confidence, target);

    if (isTarget && confidence >= CONFIDENCE_THRESHOLD) {
      Serial.printf("[EI] TARGET TERDETEKSI di window %u! confidence=%.4f >= %.2f\n",
                    (unsigned)windowsChecked, confidence, CONFIDENCE_THRESHOLD);
      return true; // Early exit: satu pengenalan valid sudah cukup
    }

    if (offset == lastStart) {
      checkedLast = true;
      break;
    }
    const size_t next = offset + MIC_WINDOW_HOP_SAMPLES;
    offset = next >= lastStart ? lastStart : next;
  }

  Serial.printf("[EI] Selesai %u window (last=%s). Tidak ada deteksi target >= %.2f.\n",
                (unsigned)windowsChecked, checkedLast ? "YES" : "NO",
                CONFIDENCE_THRESHOLD);
  Serial.printf("[EI] Confidence target maksimum (saat top-1) = %.4f\n",
                highestTargetConfidence);
  return false;
}

bool ujiUcapan(
  const char *labelTarget,
  const char *modelLabelTarget,
  LingoSpeechModel model,
  bool *percobaanDiproses
) {
  Serial.println();
  Serial.println("======================================");
  Serial.print("Target ucapan : ");
  Serial.println(labelTarget);
  Serial.println("======================================");
  if (percobaanDiproses) *percobaanDiproses = false;

  // Track 171 sudah selesai diputar sebelum percobaan dimulai.
  // Baca INMP441 langsung saat MIC ditekan, tanpa delay DFPlayer.
  const bool rekamanBerhasil = recordAudioWhileHeld();

  // Pastikan suara 172 SELALU setelah recording selesai, tidak masuk dataset.
  playMicOffCue();
  if (!rekamanBerhasil) {
    Serial.println("ERROR: Rekaman gagal atau terlalu singkat.");
    return false;
  }

  Serial.println("Memproses SELURUH rekaman dengan jendela MFE 1 detik...");
  Serial.printf("[MEM] Sebelum EI: free PSRAM=%u, free internal=%u bytes\n",
                (unsigned)ESP.getFreePsram(), (unsigned)ESP.getFreeHeap());

  bool inferenceBerhasil = false;
  bool benar = recognizeAcrossRecording(model, modelLabelTarget, &inferenceBerhasil);

  Serial.printf("[MEM] Sesudah EI: free PSRAM=%u, free internal=%u bytes\n",
                (unsigned)ESP.getFreePsram(), (unsigned)ESP.getFreeHeap());
  if (!inferenceBerhasil) {
    Serial.println("[EI] Semua inferensi gagal: percobaan tidak dihitung.");
    return false;
  }
  if (percobaanDiproses) *percobaanDiproses = true;

  if (benar) Serial.println(">>> UCAPAN BENAR (ada window valid) <<<");
  else Serial.println(">>> UCAPAN BELUM SESUAI (tidak ada window valid) <<<");
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

  Serial.printf(
    "Target %s -> Percobaan %d dari %d\n",
    labelTantanganBicara[i],
    jumlahPercobaanBicara[i] + 1,
    MAX_PERCOBAAN_BICARA
  );

  bool percobaanDiproses = false;
  bool benar = ujiUcapan(
    labelTantanganBicara[i],
    modelLabelTantanganBicara[i],
    modelTantanganBicara[i],
    &percobaanDiproses
  );
  if (!percobaanDiproses) {
    Serial.println("Percobaan tidak dihitung (rekaman terlalu singkat atau inferensi gagal).");
    playMicReadyCue();
    return;
  }
  jumlahPercobaanBicara[i]++;

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

      // Mainkan cue siap lagi untuk percobaan berikutnya, sesudah feedback SALAH.
      delay(DURASI_CUE_MIC_MS);
      playMicReadyCue();
      Serial.println("Tekan GPIO 41 lagi untuk mencoba.");

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
          playMicReadyCue();
        }

        return;
      }
    }

    // B. Tombol MIC sekarang menggunakan GPIO 41.
    // Pemrosesannya dilakukan di loop() melalui
    // handleMicButtonPress().
  }

  // 3. Cek input Misi Juara dan Mencocokkan Suku Kata.
  if (
    halamanAktif == HALAMAN_MISI_JUARA_1 ||
    halamanAktif == HALAMAN_MISI_JUARA_2 ||
    halamanAktif == HALAMAN_MENCOCOKKAN_SUKU_KATA
  ) {
    
    KuisInteraktif* daftarSoal;
    int jumlahSoal;

    if (halamanAktif == HALAMAN_MISI_JUARA_1) {
      daftarSoal = soalMisiJuara1;
      jumlahSoal = JUMLAH_SOAL_MISI_JUARA_1;
    } else if (halamanAktif == HALAMAN_MISI_JUARA_2) {
      daftarSoal = soalMisiJuara2;
      jumlahSoal = JUMLAH_SOAL_MISI_JUARA_2;
    } else {
      daftarSoal = soalMencocokkan;
      jumlahSoal = JUMLAH_SOAL_MENCOCOKKAN;
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
          
          if (
            halamanAktif == HALAMAN_MENCOCOKKAN_SUKU_KATA &&
            daftarSoal[indeksJawaban].trackAudioJawaban != 0
          ) {
            delay(DURASI_AUDIO_KANAN_MENCOCOKKAN_MS);
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

#if !LINGO_WIFI_ENABLED
  Serial.println(
    "WiFi dinonaktifkan dari konfigurasi build."
  );

  enterOfflineMode();
  return;
#endif

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


void enterOfflineMode() {

  wifiState =
    WIFI_OFFLINE;

  lingoReady =
    true;

  Serial.println();
  Serial.println(
    "======================================"
  );
  Serial.println(
    "LINGO OFFLINE MODE"
  );
  Serial.println(
    "Permainan berjalan tanpa koneksi WiFi."
  );
  Serial.println(
    "======================================"
  );

  myDFPlayer.playMp3Folder(
    0
  );
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
    LOW;

  bool currentState =
    digitalRead(
      MIC_BUTTON_PIN
    );

  bool pressed =
    (
      lastButtonState == LOW &&
      currentState == HIGH
    );

  lastButtonState =
    currentState;

  return pressed;
}


void handleWiFiState() {

#if !LINGO_WIFI_ENABLED
  return;
#endif

  switch (
    wifiState
  ) {

    case WIFI_FIRST_SETUP:

      wm.process();

      playTrack399();

      // GPIO 41 dapat memilih mode offline tanpa harus menyelesaikan
      // konfigurasi WiFi terlebih dahulu.
      if (
        micButtonPressed()
      ) {
        enterOfflineMode();
        break;
      }

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

        enterOfflineMode();
      }

      break;
      // Mode offline dipilih secara eksplisit dan dipertahankan sampai
      // perangkat reboot. Pengiriman sesi belum diaktifkan.
  }
}


// =========================================================
// SEND SESSION
// =========================================================

void sendSession() {

#if !LINGO_WIFI_ENABLED
  Serial.println(
    "Upload dibatalkan: WiFi dinonaktifkan."
  );

  return;
#endif

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
    INPUT_PULLDOWN
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

  // Trigger hanya pada transisi LOW -> HIGH, agar tidak memproses berulang
  // saat tombol masih ditahan atau kondisi halaman/target belum valid.
  static bool micButtonWasHigh = false;
  const bool micButtonIsHigh = (digitalRead(MIC_BUTTON_PIN) == HIGH);
  if (
    lingoReady &&
    wifiState != WIFI_FAILED &&
    wifiState != WIFI_FIRST_SETUP &&
    micButtonIsHigh && !micButtonWasHigh
  ) {
    handleMicButtonPress();
  }
  micButtonWasHigh = (digitalRead(MIC_BUTTON_PIN) == HIGH);


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
