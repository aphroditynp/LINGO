#define EIDSP_QUANTIZE_FILTERBANK 0

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
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
#define LINGO_WIFI_ENABLED 1
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

// Backend yang juga dipakai oleh dashboard/src/api.js.
// Untuk testing lokal, alamat bisa diganti menjadi IP LAN komputer.
const char *serverURL = "https://lingo-7ri9.onrender.com/api/session/upload";
// Ganti dengan ID perangkat yang sudah terdaftar dan dipasangkan di website.
const char *LINGO_DEVICE_ID = "LINGO001";
// HANYA UNTUK PENGUJIAN: HTTPS tanpa validasi sertifikat.
// Untuk produksi, pasang sertifikat root CA menggunakan client.setCACert(...).
const bool LINGO_INSECURE_HTTPS_TEST_ONLY = true;

#define TRACK_WIFI_SETUP 399
#define TRACK_WIFI_FAILED 400

const unsigned long WIFI_CONNECT_TIMEOUT = 15000;
const unsigned long WIFI_AUDIO_INTERVAL = 7000;
// Jika WiFi yang sedang dipakai putus: reconnect selama 15 detik,
// lalu buka kembali portal WiFi di hotspot LINGO_SETUP.
const unsigned long WIFI_PORTAL_RETRY_INTERVAL = 10000;

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
unsigned long wifiReconnectStartedAt = 0;
unsigned long wifiPortalLastAttemptAt = 0;

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
const float CONFIDENCE_THRESHOLD = 0.65f; // sesuai main.cpp yang diberikan; uji FAR sebelum produksi
const size_t LINGO_SPEECH_SAMPLE_COUNT = 16000; // 1 detik per inferensi
const int LINGO_SPEECH_SAMPLE_RATE = 16000;
const int AUDIO_MIC_MULAI = 171;
const int AUDIO_MIC_MATI  = 172;
const unsigned long DURASI_CUE_MIC_MS = 1200;
const size_t MIC_MIN_VALID_SAMPLES = 2400; // 150 ms, hindari klik tombol
const size_t MIC_MAX_RECORD_SAMPLES = 5 * LINGO_SPEECH_SAMPLE_COUNT; // 5 detik
// Geser parameter ini jika ingin mengubah waktu mulai analisis audio.
const float INFERENCE_START_SECONDS = 0.5f; // Mulai dari 0,5 detik
const size_t MIC_WINDOW_HOP_SAMPLES = 8000; // 500 ms / overlap 50%
// Track 171 diputar segera ketika tombol MIC GPIO41 ditekan.
// Tunggu cue selesai sebelum sampling I2S agar suara DFPlayer tidak terekam.
// Tombol harus tetap ditahan selama cue dan ucapan.
// Track 172 diputar setelah tombol dilepas / rekaman dihentikan.
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

const int HALAMAN_TANTANGAN_BICARA_2 = 8; // buku halaman 16
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

// These enums now choose the expected label in ONE shared six-class model.
// Each button no longer loads a different neural network.
const LingoSpeechModel modelTantanganBicara[4] = {
  LINGO_MODEL_ITU,
  LINGO_MODEL_AKU,
  LINGO_MODEL_BIMA,
  LINGO_MODEL_LULA
};

#define MIC_BUTTON_PIN 41 // Tombol MIC fisik langsung ke GPIO 41

// Status tantangan disimpan per kata sampai GO ke-8 dipilih untuk reset.
const int MAX_PERCOBAAN_BICARA = 3;
const int AUDIO_TIGA_KALI_SALAH = 450; // MP3/0450.mp3 pada kartu SD DFPlayer
int jumlahPercobaanBicara[4] = {0, 0, 0, 0};
bool kataSudahBenar[4] = {false, false, false, false};
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
  {25, 38, 30, 45, 52},
  {29, 39, 34, 46, 53},
  {33, 40, 18, 47, 54},
  {37, 41, 22, 48, 55} 
};



// =========================================================
// PENILAIAN PER HALAMAN + QUEUE UPLOAD NVS
// Nomor halaman buku bukan indeks GO; map mengikuti gambar buku.
// Skor = banyak soal/kata UNIK yang benar / total tugas halaman.
// Wrong = banyak percobaan gagal (tidak mengurangi total tugas).
// =========================================================
struct LingoPageDefinition {
  int goIndex;
  int bookPage;
  const char *module;
  const char *moduleId;
  uint8_t tasks;
  bool modelAvailable;
};

const LingoPageDefinition PAGE_DEFS[] = {
  {7, 14, "Tantangan Bicara 1", "tantangan_bicara_1", 4, true},
  {8, 16, "Tantangan Bicara 2", "tantangan_bicara_2", 12, false},
  {6, 18, "Misi Juara 1", "misi_juara_1", 2, true},
  {9, 20, "Misi Juara 2", "misi_juara_2", 2, true},
  {10, 22, "Mencocokkan Suku Kata", "mencocokkan_suku_kata", 7, true}
};
constexpr int PAGE_COUNT = sizeof(PAGE_DEFS) / sizeof(PAGE_DEFS[0]);
constexpr int QUEUE_CAPACITY = 12;

struct PageUpload {
  char sessionId[76];
  char module[40];
  char moduleId[32];
  uint16_t bookPage;
  uint8_t totalTasks;
  uint8_t correct;
  uint16_t wrong;
  uint16_t attempts;
  uint32_t durationSec;
  bool pendingModel;
};

struct PageProgress {
  int pageDef = -1;
  unsigned long startedAt = 0;
  uint16_t wrong = 0;
  uint16_t attempts = 0;
  bool touched = false;
  bool passed[12] = {false};
};

PageProgress pageProgress;
PageUpload pageQueue[QUEUE_CAPACITY] = {};
uint8_t queueCount = 0;
unsigned long lastUploadAttemptMs = 0;

int pageDefinitionIndex(int goIndex) {
  for (int j = 0; j < PAGE_COUNT; ++j)
    if (PAGE_DEFS[j].goIndex == goIndex) return j;
  return -1;
}

void savePageQueue() {
  Preferences prefs;
  if (!prefs.begin("lingo-scores", false)) return;
  prefs.putUChar("count", queueCount);
  prefs.putBytes("queue", pageQueue, sizeof(pageQueue));
  prefs.end();
}

void loadPageQueue() {
  Preferences prefs;
  if (!prefs.begin("lingo-scores", true)) return;
  uint8_t n = prefs.getUChar("count", 0);
  size_t storedBytes = prefs.getBytesLength("queue");
  if (n <= QUEUE_CAPACITY && storedBytes == sizeof(pageQueue)) {
    prefs.getBytes("queue", pageQueue, sizeof(pageQueue));
    queueCount = n;
  }
  prefs.end();
  Serial.printf("[SKOR] %u sesi menunggu upload di NVS.\n", (unsigned)queueCount);
}

uint8_t numberCorrect(const PageProgress &progress) {
  if (progress.pageDef < 0) return 0;
  uint8_t count = 0;
  for (int i = 0; i < PAGE_DEFS[progress.pageDef].tasks; ++i)
    if (progress.passed[i]) ++count;
  return count;
}

void printPageProgress() {
  if (pageProgress.pageDef < 0) return;
  const LingoPageDefinition &d = PAGE_DEFS[pageProgress.pageDef];
  if (!d.modelAvailable) {
    Serial.printf("[SKOR] Hal %d %s: model belum tersedia (TIDAK dinilai).\n", d.bookPage, d.module);
    return;
  }
  Serial.printf("[SKOR] Hal %d %s: %u/%u benar | %u salah | %u percobaan | %.1f%%\n",
    d.bookPage, d.module, (unsigned)numberCorrect(pageProgress), (unsigned)d.tasks,
    (unsigned)pageProgress.wrong, (unsigned)pageProgress.attempts,
    100.0f * numberCorrect(pageProgress) / d.tasks);
}

void beginPageScore(int goIndex) {
  pageProgress = PageProgress{};
  pageProgress.pageDef = pageDefinitionIndex(goIndex);
  pageProgress.startedAt = millis();
  if (pageProgress.pageDef >= 0) {
    const LingoPageDefinition &d = PAGE_DEFS[pageProgress.pageDef];
    Serial.printf("[SKOR] Mulai halaman buku %d: %s (%u tugas).\n", d.bookPage, d.module, (unsigned)d.tasks);
    if (!d.modelAvailable) Serial.println("[SKOR] Model suara halaman ini belum tersedia; skor tidak akan dikarang.");
  }
}

void notePageAnswer(int taskIndex, bool correct) {
  if (pageProgress.pageDef < 0) return;
  const LingoPageDefinition &d = PAGE_DEFS[pageProgress.pageDef];
  if (!d.modelAvailable || taskIndex < 0 || taskIndex >= d.tasks) return;
  if (pageProgress.passed[taskIndex]) return; // jawaban benar dikunci
  ++pageProgress.attempts;
  pageProgress.touched = true;
  if (correct) pageProgress.passed[taskIndex] = true;
  else ++pageProgress.wrong;
  printPageProgress();
}

void completePageScore() {
  if (pageProgress.pageDef < 0 || !pageProgress.touched) {
    pageProgress = PageProgress{};
    return;
  }
  const LingoPageDefinition &d = PAGE_DEFS[pageProgress.pageDef];
  PageUpload payload = {};
  snprintf(payload.sessionId, sizeof(payload.sessionId), "%s_%08lx%08lx", LINGO_DEVICE_ID,
           (unsigned long)esp_random(), (unsigned long)millis());
  strlcpy(payload.module, d.module, sizeof(payload.module));
  strlcpy(payload.moduleId, d.moduleId, sizeof(payload.moduleId));
  payload.bookPage = d.bookPage;
  payload.totalTasks = d.tasks;
  payload.correct = numberCorrect(pageProgress);
  payload.wrong = pageProgress.wrong;
  payload.attempts = pageProgress.attempts;
  payload.durationSec = (uint32_t)((millis() - pageProgress.startedAt) / 1000UL);
  payload.pendingModel = !d.modelAvailable;
  if (queueCount >= QUEUE_CAPACITY) {
    Serial.println("[SKOR][ERROR] Queue upload penuh; data lama tidak ditimpa.");
  } else {
    pageQueue[queueCount++] = payload;
    savePageQueue();
    Serial.printf("[SKOR] Hal %d disimpan di NVS (%u dalam queue).\n", d.bookPage, (unsigned)queueCount);
  }
  pageProgress = PageProgress{};
}

void maybeFinishCompletedPage() {
  if (pageProgress.pageDef < 0) return;
  const LingoPageDefinition &d = PAGE_DEFS[pageProgress.pageDef];
  if (d.modelAvailable && numberCorrect(pageProgress) == d.tasks) {
    Serial.println("[SKOR] Seluruh tugas halaman benar; simpan sesi sekarang.");
    completePageScore();
  }
}

void markPage16NotAssessed(int pin) {
  if (pageProgress.pageDef != pageDefinitionIndex(HALAMAN_TANTANGAN_BICARA_2)) return;
  pageProgress.touched = true;
  ++pageProgress.attempts;
  Serial.printf("[SKOR] Hal 16 pin %d: belum ada model ucapan; tidak menghitung benar/salah.\n", pin);
}

bool uploadPagePayload(const PageUpload &s) {
#if !LINGO_WIFI_ENABLED
  (void)s;
  return false;
#else
  if (WiFi.status() != WL_CONNECTED) return false;
  WiFiClientSecure client;
  if (LINGO_INSECURE_HTTPS_TEST_ONLY) client.setInsecure();
  else {
    Serial.println("[UPLOAD] Sertifikat CA belum diisi. Mode produksi belum diaktifkan.");
    return false;
  }
  HTTPClient http;
  if (!http.begin(client, serverURL)) return false;
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  StaticJsonDocument<768> doc;
  doc["session_id"] = s.sessionId;
  doc["device_id"] = LINGO_DEVICE_ID;
  doc["module"] = s.module;
  doc["module_id"] = s.moduleId;
  doc["page_number"] = s.bookPage;
  doc["total_question"] = s.totalTasks;
  doc["correct"] = s.correct;
  doc["wrong"] = s.wrong;
  doc["attempts"] = s.attempts;
  doc["duration"] = s.durationSec;
  if (s.pendingModel) {
    doc["status"] = "pending_model";
    doc["accuracy"] = nullptr;
  } else {
    doc["status"] = "graded";
    doc["accuracy"] = roundf(100.0f * s.correct / s.totalTasks);
  }
  String body;
  serializeJson(doc, body);
  Serial.printf("[UPLOAD] %s, payload=%s\n", s.module, body.c_str());
  int code = http.POST(body);
  String response = http.getString();
  http.end();
  Serial.printf("[UPLOAD] HTTP %d %s\n", code, response.c_str());
  return code >= 200 && code < 300;
#endif
}

void sendSession() {
  if (!queueCount) {
    Serial.println("[UPLOAD] Queue kosong.");
    return;
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("[UPLOAD] Offline; %u sesi disimpan di NVS untuk retry.\n", (unsigned)queueCount);
    return;
  }
  while (queueCount) {
    if (!uploadPagePayload(pageQueue[0])) break;
    for (int i = 1; i < queueCount; ++i) pageQueue[i - 1] = pageQueue[i];
    --queueCount;
    savePageQueue();
  }
}

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
void onWiFiConnected();
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
    kataSudahBenar[i] = false;
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

// Suara 171 diputar pada event tombol MIC ditekan.
// Perekaman dimulai setelah cue berhenti agar suaranya tidak terekam.
void playMicReadyCue() {
  Serial.println("[MIC] GPIO 41 ditekan: Track 171 -> MIC MULAI");
  myDFPlayer.stop();
  delay(60);
  myDFPlayer.playMp3Folder(AUDIO_MIC_MULAI);
  delay(DURASI_CUE_MIC_MS);
  myDFPlayer.stop();
  Serial.println("[MIC] Cue selesai. Mulai bicara sambil tetap menahan GPIO 41, lalu LEPAS.");
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

// Periksa mulai INFERENCE_START_SECONDS (default 0,5 s; window 0,5-1,5 s).
// Jika rekaman tidak cukup panjang untuk window awal, gunakan window
// TERAKHIR yang tersedia agar ucapan pendek tidak otomatis terlewat.
// Ukuran input MFE tetap 1 detik (16.000 sampel), hop default 500 ms.
// Jika satu window sesuai target dengan confidence >= threshold, hentikan.
// Stopwatch berbasis millis() mengukur durasi proses EI per window + total.
bool recognizeAcrossRecording(
  LingoSpeechModel model, const char *target,
  bool *inferenceSucceeded
) {
  if (inferenceSucceeded) *inferenceSucceeded = false;
  if (recordedAudioSamples < MIC_MIN_VALID_SAMPLES) return false;

  const size_t lastStart = (recordedAudioSamples > LINGO_SPEECH_SAMPLE_COUNT)
    ? recordedAudioSamples - LINGO_SPEECH_SAMPLE_COUNT : 0;

  // Konversi detik ke sampel, tanpa mengubah durasi window (1 detik).
  const size_t desiredStart = (size_t)(
    INFERENCE_START_SECONDS * (float)LINGO_SPEECH_SAMPLE_RATE
  );
  // Gunakan start yang diminta jika masih tersedia 1 window penuh.
  // Jika rekaman lebih singkat, gunakan window paling akhir.
  // Untuk rekaman <1 detik, prepareInferenceWindow() menambahkan silence.
  const size_t firstStart =
    (recordedAudioSamples >= desiredStart + LINGO_SPEECH_SAMPLE_COUNT)
      ? desiredStart
      : lastStart;

  size_t offset = firstStart;
  size_t windowsChecked = 0;
  float highestTargetConfidence = 0.0f;
  const uint32_t totalStartMs = millis();

  Serial.printf("[EI][TIMER] Mulai inferensi | rekaman=%.2f s | jendela awal=%.2f-%.2f s | hop=%.0f ms\n",
                (float)recordedAudioSamples / LINGO_SPEECH_SAMPLE_RATE,
                (float)firstStart / LINGO_SPEECH_SAMPLE_RATE,
                (float)(firstStart + LINGO_SPEECH_SAMPLE_COUNT) / LINGO_SPEECH_SAMPLE_RATE,
                1000.0f * MIC_WINDOW_HOP_SAMPLES / LINGO_SPEECH_SAMPLE_RATE);

  while (true) {
    prepareInferenceWindow(offset);
    const char *predicted = nullptr;
    float confidence = 0.0f;
    Serial.printf("[EI][PROSES] Window %u: %.2f-%.2f s | waktu berjalan %.2f s...\n",
                  (unsigned)(windowsChecked + 1),
                  (float)offset / LINGO_SPEECH_SAMPLE_RATE,
                  (float)(offset + LINGO_SPEECH_SAMPLE_COUNT) / LINGO_SPEECH_SAMPLE_RATE,
                  (float)(uint32_t)(millis() - totalStartMs) / 1000.0f);

    const uint32_t windowStartMs = millis();
    const bool ok = lingoRecognize(
      model, audioBuffer, LINGO_SPEECH_SAMPLE_COUNT,
      &predicted, &confidence
    );
    const uint32_t windowMs = (uint32_t)(millis() - windowStartMs);
    const uint32_t elapsedMs = (uint32_t)(millis() - totalStartMs);
    ++windowsChecked;

    Serial.printf("[EI][TIMER] Window %u: %lu ms | total berjalan: %.2f s\n",
                  (unsigned)windowsChecked,
                  (unsigned long)windowMs,
                  (float)elapsedMs / 1000.0f);

    if (!ok || predicted == nullptr) {
      Serial.printf("[EI] Gagal inferensi window %u. Total=%.2f s. Tidak akan menyatakan BENAR.\n",
                    (unsigned)windowsChecked, (float)elapsedMs / 1000.0f);
      if (inferenceSucceeded) *inferenceSucceeded = false;
      return false;
    }
    if (inferenceSucceeded) *inferenceSucceeded = true;

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
      Serial.printf("[EI][TIMER] SELESAI (BENAR): %u window | total inferensi %.2f s\n",
                    (unsigned)windowsChecked,
                    (float)(uint32_t)(millis() - totalStartMs) / 1000.0f);
      return true;
    }

    if (offset == lastStart) break;
    const size_t next = offset + MIC_WINDOW_HOP_SAMPLES;
    offset = next >= lastStart ? lastStart : next;
  }

  Serial.printf("[EI] Tidak ada target >= %.2f (confidence target maksimum saat top-1 = %.4f).\n",
                CONFIDENCE_THRESHOLD, highestTargetConfidence);
  Serial.printf("[EI][TIMER] SELESAI (BELUM SESUAI): %u window | total inferensi %.2f s\n",
                (unsigned)windowsChecked,
                (float)(uint32_t)(millis() - totalStartMs) / 1000.0f);
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

  // Track 171 sudah diputar pada event penekanan GPIO41.
  // Rekam setelah cue selesai agar audio DFPlayer tidak ikut masuk ke MFE.
  const bool rekamanBerhasil = recordAudioWhileHeld();

  // Pastikan suara 172 SELALU setelah recording selesai, tidak masuk dataset.
  playMicOffCue();
  if (!rekamanBerhasil) {
    Serial.println("ERROR: Rekaman gagal atau terlalu singkat.");
    return false;
  }

  Serial.printf("Memproses audio mulai detik %.2f (rekaman pendek: window akhir), hop %.0f ms, model gabungan...\n",
                INFERENCE_START_SECONDS,
                1000.0f * MIC_WINDOW_HOP_SAMPLES / LINGO_SPEECH_SAMPLE_RATE);
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

  // Kata yang sudah BENAR tidak boleh diuji ulang sekalipun dipilih lagi.
  // Pengecekan sebelum track 171, rekaman, dan Edge Impulse.
  if (kataSudahBenar[i]) {
    Serial.printf("[KUNCI] %s sudah BENAR. Tidak bisa dicoba lagi.\n",
                  labelTantanganBicara[i]);
    Serial.println("Pilih kata lain atau reset dengan GO ke-8 (pin 15).");
    return;
  }

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

  // Putar audio MIC MULAI tepat pada penekanan GPIO41, bukan saat pilih kata.
  // Tunggu track selesai dahulu: rekaman setelah cue, tanpa kontaminasi speaker.
  playMicReadyCue();
  if (digitalRead(MIC_BUTTON_PIN) != HIGH) {
    Serial.println("[MIC] GPIO 41 dilepas saat cue 171. Tidak merekam / tidak mengurangi percobaan.");
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
    Serial.println("Tekan kembali GPIO 41 untuk mendengar cue MIC MULAI dan mencoba lagi.");
    return;
  }
  jumlahPercobaanBicara[i]++;
  notePageAnswer(i, benar);
  maybeFinishCompletedPage();

  if (benar) {

    Serial.println(
      "Kalimat BENAR."
    );

    myDFPlayer.playMp3Folder(
      AUDIO_BENAR
    );

    // Jangan nolkan jumlah percobaan. Kunci kata ini sampai reset.
    kataSudahBenar[i] = true;
    targetBicaraAktif = -1;

    Serial.printf("[KUNCI] %s selesai dengan BENAR.\n", labelTantanganBicara[i]);
    Serial.println("Kata ini tidak dapat dicoba lagi sampai GO ke-8 di-reset.");
    Serial.println("Pilih kata berikutnya.");

  } else {

    Serial.println("Kalimat SALAH.");

    int sisa = MAX_PERCOBAAN_BICARA - jumlahPercobaanBicara[i];
    if (sisa > 0) {
      // Hanya percobaan salah ke-1 dan ke-2 memainkan track 31.
      myDFPlayer.playMp3Folder(AUDIO_SALAH);
      Serial.printf("Sisa percobaan: %d\n", sisa);
      Serial.println("Tekan GPIO 41 lagi untuk mencoba (track 171 akan diputar).");
    } else {
      // Percobaan salah ke-3: ganti suara salah biasa dengan track 450.
      // Memutar 31 tepat sebelumnya berisiko diinterupsi oleh DFPlayer.
      Serial.printf("[BATAS] %s sudah SALAH 3 kali. Track 450.\n",
                    labelTantanganBicara[i]);
      myDFPlayer.playMp3Folder(AUDIO_TIGA_KALI_SALAH);
      targetBicaraAktif = -1;
      Serial.println("Kata ini dikunci sampai reset GO ke-8 (pin 15).");
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
      completePageScore();
      halamanAktif = i;
      beginPageScore(i); 
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
        Serial.println();
        Serial.print("Kalimat dipilih: ");
        Serial.println(labelTantanganBicara[i]);

        if (kataSudahBenar[i]) {
          // Jangan aktifkan target yang sudah lulus: tidak ada cue atau rekaman.
          targetBicaraAktif = -1;
          Serial.println("[KUNCI] Kata ini sudah BENAR dan tidak dapat diulang.");
          Serial.println("Pilih kata lain atau GO ke-8 untuk reset.");
          return;
        }

        if (jumlahPercobaanBicara[i] >= MAX_PERCOBAAN_BICARA) {
          targetBicaraAktif = -1;
          Serial.println("Batas 3 percobaan untuk kata ini sudah tercapai.");
          Serial.println("Tekan GO ke-8 (pin 15) untuk reset.");
          return;
        } else {
          targetBicaraAktif = i;
          Serial.printf(
            "Percobaan terpakai: %d/%d\n",
            jumlahPercobaanBicara[i],
            MAX_PERCOBAAN_BICARA
          );
          Serial.println("Tekan GPIO 41 untuk memainkan track 171 (MIC MULAI), lalu bicara.");
        }

        return;
      }
    }

    // B. Tombol MIC sekarang menggunakan GPIO 41.
    // Pemrosesannya dilakukan di loop() melalui
    // handleMicButtonPress().
  }

  // Halaman 16 memiliki 12 kata berbeda dan belum ditraining dalam model gabungan.
  // Log aktivitas halaman, tanpa memberi nilai palsu.
  if (halamanAktif == HALAMAN_TANTANGAN_BICARA_2) {
    markPage16NotAssessed(pinGlobal);
    return;
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
            notePageAnswer(soalAktif, true);
            maybeFinishCompletedPage();
            Serial.println("Pasangan BENAR!");
            if (daftarSoal[soalAktif].trackAudioGabungan != 0) {
              myDFPlayer.playMp3Folder(daftarSoal[soalAktif].trackAudioGabungan);
            } else {
              myDFPlayer.playMp3Folder(AUDIO_BENAR);
            }
            soalAktif = -1; // Reset memori
          } else {
            notePageAnswer(soalAktif, false);
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
  // Preferences lama tetap didukung. Cek kredensial WiFiManager juga,
  // agar portal tidak muncul jika WiFi sudah tersimpan pada ESP32.
  bool configured = false;
  if (wifiPreferences.begin("lingo-wifi", true)) {
    configured = wifiPreferences.getBool("configured", false);
    wifiPreferences.end();
  }
  return configured || wm.getWiFiIsSaved();
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


// Portal bisa dipakai saat pertama kali setup DAN ketika WiFi lama gagal.
// startConfigPortal() dengan mode non-blocking normalnya mengembalikan false;
// status sebenarnya diperiksa melalui getConfigPortalActive().
void startFirstTimeWiFiSetup() {
  if (wm.getConfigPortalActive()) {
    wifiState = WIFI_FIRST_SETUP;
    lingoReady = false;
    return;
  }

  Serial.println();
  Serial.println("======================================");
  Serial.println("     KONFIGURASI WIFI LINGO");
  Serial.println("======================================");
  Serial.println("Hubungkan HP ke hotspot: LINGO_SETUP");
  Serial.println("Buka http://192.168.4.1 jika portal tidak otomatis muncul.");
  Serial.println("GPIO 41: pilih mode OFFLINE.");

  wm.setConfigPortalBlocking(false);
  wm.setConfigPortalTimeout(0);  // tidak mati otomatis
  wifiPortalLastAttemptAt = millis();
  wm.startConfigPortal("LINGO_SETUP");

  if (wm.getConfigPortalActive()) {
    wifiState = WIFI_FIRST_SETUP;
    lingoReady = false;
    lastWifiAudio = millis() - WIFI_AUDIO_INTERVAL;
    Serial.printf("[WIFI] Portal aktif, IP=%s\n", WiFi.softAPIP().toString().c_str());
  } else {
    wifiState = WIFI_FAILED;
    lingoReady = false;
    lastWifiAudio = millis() - WIFI_AUDIO_INTERVAL;
    Serial.println("[WIFI] Portal gagal aktif; akan dicoba ulang.");
  }
}

// Dipanggil baik setelah WiFi lama kembali tersambung maupun setelah
// pengguna berhasil menyimpan WiFi baru melalui portal.
void onWiFiConnected() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (wm.getConfigPortalActive()) wm.stopConfigPortal();
  markWiFiConfigured();
  wifiState = WIFI_ONLINE;
  lingoReady = true;
  Serial.printf("[WIFI] ONLINE | SSID=%s | IP=%s\n",
                WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
  // Queue sesi penilaian akan di-upload ulang oleh loop() saat online.
}

void startWiFiSystem() {
#if !LINGO_WIFI_ENABLED
  Serial.println("WiFi dinonaktifkan dari konfigurasi build.");
  enterOfflineMode();
  return;
#endif

  // WiFi yang terhubung kembali otomatis tidak boleh memutus alur permainan.
  WiFi.setAutoReconnect(true);
  if (hasSavedWiFi()) {
    Serial.println("[WIFI] WiFi tersimpan ada. Mencoba selama 15 detik...");
    wifiState = WIFI_CONNECTING;
    lingoReady = false;
    if (connectSavedWiFi()) {
      onWiFiConnected();
    } else {
      Serial.println("[WIFI] WiFi tersimpan tidak terhubung; buka LINGO_SETUP.");
      startFirstTimeWiFiSetup();
    }
  } else {
    Serial.println("[WIFI] Belum ada WiFi tersimpan; buka LINGO_SETUP.");
    startFirstTimeWiFiSetup();
  }
}

void enterOfflineMode() {
  // Portal tidak boleh tertinggal terbuka jika pengguna memilih offline.
  if (wm.getConfigPortalActive()) wm.stopConfigPortal();
  wifiState = WIFI_OFFLINE;
  lingoReady = true;
  Serial.println();
  Serial.println("======================================");
  Serial.println("LINGO OFFLINE MODE");
  Serial.println("Permainan berjalan tanpa koneksi WiFi.");
  Serial.println("Sesi penilaian tertunda tetap tersimpan di NVS.");
  Serial.println("======================================");
  myDFPlayer.playMp3Folder(0);
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

  switch (wifiState) {
    case WIFI_FIRST_SETUP: {
      // Webserver + DNS WiFiManager perlu dilayani terus pada mode non-blocking.
      if (wm.getConfigPortalActive()) wm.process();
      if (WiFi.status() == WL_CONNECTED) {
        Serial.println("[WIFI] Konfigurasi berhasil, kembali online.");
        onWiFiConnected();
        break;
      }
      // Bila portal tidak aktif (mis. pengguna menutupnya), buka lagi.
      if (!wm.getConfigPortalActive() &&
          millis() - wifiPortalLastAttemptAt >= WIFI_PORTAL_RETRY_INTERVAL) {
        startFirstTimeWiFiSetup();
      }
      playTrack399();
      if (micButtonPressed()) enterOfflineMode();
      break;
    }

    case WIFI_CONNECTING: {
      // Reconnect tanpa delay 15 detik di dalam loop sehingga UI tidak macet.
      if (WiFi.status() == WL_CONNECTED) {
        Serial.println("[WIFI] Reconnect berhasil.");
        onWiFiConnected();
      } else if (millis() - wifiReconnectStartedAt >= WIFI_CONNECT_TIMEOUT) {
        Serial.println("[WIFI] Reconnect 15 detik gagal; buka LINGO_SETUP.");
        startFirstTimeWiFiSetup();
      }
      break;
    }

    case WIFI_ONLINE: {
      if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WIFI] Koneksi terputus. Coba sambungkan ulang 15 detik...");
        wifiState = WIFI_CONNECTING;
        lingoReady = false;
        wifiReconnectStartedAt = millis();
        WiFi.reconnect();
      }
      break;
    }

    case WIFI_FAILED: {
      // Fallback jika portal gagal dibuat; tidak hanya memutar track 400.
      if (WiFi.status() == WL_CONNECTED) {
        onWiFiConnected();
      } else {
        playTrack400();
        if (micButtonPressed()) {
          enterOfflineMode();
        } else if (millis() - wifiPortalLastAttemptAt >= WIFI_PORTAL_RETRY_INTERVAL) {
          Serial.println("[WIFI] Mencoba membuka ulang portal LINGO_SETUP...");
          startFirstTimeWiFiSetup();
        }
      }
      break;
    }

    case WIFI_OFFLINE:
      // Offline dipilih pengguna: jangan nyalakan portal secara otomatis.
      break;
  }
}

// =========================================================
// SEND SESSION
// =========================================================

// Implementasi sendSession() sekarang ada di bagian PENILAIAN PER HALAMAN.

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

  loadPageQueue();
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


    // u = upload ulang queue penilaian, p = skor halaman saat ini
    if (command == 'u') sendSession();
    if (command == 'p') printPageProgress();
    if (command == 'f') { completePageScore(); sendSession(); }

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
  // Ketika portal LINGO_SETUP aktif / WIFI_FAILED:
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


  // Retry upload tertunda hanya ketika WiFi terhubung (interval 15 detik).
  if (lingoReady && WiFi.status() == WL_CONNECTED && queueCount &&
      millis() - lastUploadAttemptMs > 15000) {
    lastUploadAttemptMs = millis();
    sendSession();
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
