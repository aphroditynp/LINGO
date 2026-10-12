# Panduan Edit Misi LINGO

File program utama ada di:

`src/main.cpp`

Panduan ini dibuat supaya perubahan soal, kunci jawaban, nomor audio, dan
durasi bisa dilakukan tanpa mencari-cari seluruh file.

## Urutan tombol GO

Urutan halaman mengikuti array `pinTombolGo` di `src/main.cpp`:

```cpp
const int pinTombolGo[TOTAL_HALAMAN] = {
  1, 2, 3, 4, 5, 6, 7, 15, 14, 13, 12
};
```

Indeks halaman dimulai dari `0`, sedangkan nomor GO yang terlihat dimulai dari
`1`.

| GO | Indeks program | Isi halaman |
|---:|---:|---|
| 1 | 0 | Halaman pembuka |
| 2 | 1 | Jelajah huruf Bima |
| 3 | 2 | Latihan Bima |
| 4 | 3 | Latihan Bima |
| 5 | 4 | Jelajah huruf Lula |
| 6 | 5 | Latihan Lula |
| 7 | 6 | Misi Juara 1 |
| 8 | 7 | Tantangan Bicara |
| 9 | 8 | Tantangan Bicara lanjutan |
| 10 | 9 | Misi Juara 2 |
| 11 | 10 | Mencocokkan Suku Kata |

## Mengubah kunci Misi Juara

Ada dua array yang perlu diedit:

```cpp
soalMisiJuara1
soalMisiJuara2
```

Setiap baris memakai format:

```cpp
{pinTombolSoal, trackAudioSoal, pinJawabanBenar, 0, 0}
```

Contoh:

```cpp
{11, 32, 17, 0, 0}
```

Artinya:

- tombol soal memakai pin `11`;
- audio soal adalah track `032.mp3`;
- jawaban yang benar adalah tombol pin `17`.

Untuk mengganti kunci jawaban menjadi pin `22`:

```cpp
{11, 32, 22, 0, 0}
```

Yang menentukan benar atau salah adalah **angka ketiga**.

Baris dengan `pinTombolSoal` bernilai `99` bukan soal baru. Baris tersebut
dipakai untuk mendaftarkan tombol-tombol jawaban yang tersedia pada halaman.

## Mengubah kunci Mencocokkan Suku Kata

Edit array:

```cpp
soalMencocokkan
```

Setiap baris memakai format:

```cpp
{pinKiri, trackAudioKiri, pinKananBenar, trackAudioKanan, trackAudioGabungan}
```

Contoh:

```cpp
{10, 35, 38, 42, 49}
```

Artinya:

- tombol kiri memakai pin `10`;
- audio tombol kiri adalah track `035.mp3`;
- tombol kanan yang benar adalah pin `38`;
- audio tombol kanan adalah track `042.mp3`;
- setelah pasangan benar, audio gabungan adalah track `049.mp3`.

Untuk mengubah pasangan pertama agar pin kiri `10` cocok dengan pin kanan `22`:

```cpp
{10, 35, 22, 42, 49}
```

Yang menentukan kunci jawaban adalah **angka ketiga**.

## Mengubah nomor audio

Nomor audio pada kode mengarah ke file di folder `mp3` pada SD Card DFPlayer.
Contohnya:

```cpp
trackAudioKiri = 35
```

berarti file:

```text
mp3/035.mp3
```

Untuk mengganti audio kiri, ubah angka kedua pada baris
`soalMencocokkan`. Untuk mengganti audio kanan, ubah angka keempat.
Untuk mengganti audio gabungan, ubah angka kelima.

Jangan mengubah angka pin jika hanya ingin mengganti suara.

## Mengatur durasi audio kanan Mencocokkan Suku Kata

Durasi tunggu setelah audio tombol kanan dimainkan diatur oleh konstanta:

```cpp
const unsigned long DURASI_AUDIO_KANAN_MENCOCOKKAN_MS = 1000;
```

Nilainya dalam milidetik:

| Nilai | Durasi |
|---:|---:|
| `500` | 0,5 detik |
| `1000` | 1 detik |
| `1500` | 1,5 detik |
| `2000` | 2 detik |

Contoh jika track kanan berdurasi sekitar 2 detik:

```cpp
const unsigned long DURASI_AUDIO_KANAN_MENCOCOKKAN_MS = 2000;
```

Pengaturan ini berlaku untuk semua audio tombol kanan di halaman Mencocokkan
Suku Kata. Durasi file MP3 sebaiknya sama atau sedikit lebih pendek dari nilai
ini agar audio tidak terpotong sebelum pemeriksaan benar atau salah dilakukan.

Perlu diingat, `playMp3Folder()` hanya memulai audio. Durasi sebenarnya tetap
berasal dari panjang file MP3 di SD Card. Konstanta di atas adalah waktu tunggu
program sebelum mengecek pasangan.

## Mengatur audio tombol GO

Audio yang dimainkan saat tombol GO ditekan diatur oleh:

```cpp
const int audioTombolGo[TOTAL_HALAMAN] = {
  1, 2, 2, 2, 2, 2, 29, 170, 170, 29, 34
};
```

Posisi array mengikuti urutan `pinTombolGo`. Contoh, nilai pada posisi indeks
`9` adalah audio untuk GO ke-10.

## Mengatur audio feedback benar dan salah

```cpp
const int AUDIO_BENAR = 30;
const int AUDIO_SALAH = 31;
```

Artinya:

- `AUDIO_BENAR` memainkan `mp3/030.mp3`;
- `AUDIO_SALAH` memainkan `mp3/031.mp3`.

Pada Mencocokkan Suku Kata, jika angka kelima tidak `0`, audio gabungan akan
dimainkan. Jika angka kelima `0`, program memakai `AUDIO_BENAR`.

## Audio Tantangan Bicara

Bagian Tantangan Bicara belum perlu diedit untuk mengubah kunci Misi Juara atau
Mencocokkan Suku Kata. Pengaturan cue microphone ada di:

```cpp
const unsigned long DURASI_CUE_MIC_MS = 1200;
```

Nilai ini dipakai untuk menunggu audio mulai dan audio selesai microphone.
Durasi file `171.mp3` dan `172.mp3` sebaiknya disesuaikan dengan nilai tersebut.

Alur tombol microphone pada Tantangan Bicara:

- pilih salah satu kalimat untuk memutar audio `171.mp3` (MIC mulai);
- tekan dan tahan tombol MIC GPIO 41 selama berbicara;
- setiap percobaan saat tombol MIC ditekan juga memutar kembali audio
  `171.mp3` sebelum rekaman dimulai;
- lepaskan tombol setelah selesai berbicara;
- jika percobaan ke-3 gagal, audio hasil (`AUDIO_SALAH`) diberi waktu selesai,
  lalu diputar `172.mp3` (MIC mati).

Tombol MIC menggunakan logika aktif-HIGH: saat dilepas GPIO 41 bernilai LOW,
dan saat ditekan GPIO 41 bernilai HIGH.

Jika tombol dilepas sebelum durasi minimum model terpenuhi, rekaman dibatalkan
dan percobaan tersebut tidak diproses.

## Setelah selesai mengedit

1. Pastikan setiap baris array tetap memiliki jumlah angka yang benar.
2. Pastikan pin jawaban benar memang ada sebagai `pinTombolJawaban`.
3. Pastikan file MP3 memakai tiga digit, misalnya `042.mp3`.
4. Atur koneksi WiFi di `platformio.ini`:

   ```ini
   -DLINGO_WIFI_ENABLED=0
   ```

   Nilai `0` membuat ESP32 langsung masuk mode offline sehingga program LINGO
   dapat dicoba tanpa menyambung WiFi. Ubah menjadi `1` jika koneksi WiFi dan
   upload sesi ingin diaktifkan kembali.

5. Build firmware dari folder `esp32/LINGO-ESP32`:

```bash
pio run
```

Jika perintah `pio` tidak ada, gunakan PlatformIO dari VS Code atau jalankan:

```bash
$HOME/.platformio/penv/bin/pio run
```
