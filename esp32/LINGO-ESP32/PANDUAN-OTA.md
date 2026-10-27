# Panduan Upload Program LINGO (Kabel & WiFi)

Panduan ini untuk 2 alat: **LINGO001** dan **LINGO002**.

Setiap alat punya "env" (pilihan upload) sendiri di `platformio.ini`:

| Alat | Upload lewat kabel USB | Upload lewat WiFi (OTA) |
|---|---|---|
| LINGO001 | `lingo001` | `lingo001-ota` |
| LINGO002 | `lingo002` | `lingo002-ota` |

> ⚠️ **Jangan sampai tertukar.** Kalau program `lingo002` di-upload ke alat LINGO001,
> data anak di dashboard akan tercampur. Tempel label nama di badan setiap alat.

---

## Persiapan (cukup sekali)

1. **Pastikan kedua alat sudah terdaftar di dashboard.**
   Kalau belum, buat QR-nya dulu (lihat `backend/DEVICE-REGISTRATION.md`), lalu scan QR
   tersebut. Kalau belum terdaftar, data dari alat itu akan ditolak server.

2. **(Disarankan) Ganti password OTA.**
   Password ini mencegah orang lain mengganti program LINGO lewat WiFi.
   Ganti di **dua tempat** dan isinya harus sama persis:
   - `src/main.cpp` → `LINGO_OTA_PASSWORD = "lingo-ota-2026";`
   - `platformio.ini` → `--auth=lingo-ota-2026` (ada 2 baris: di `lingo001-ota` dan `lingo002-ota`)

---

## Tahap A — Upload pertama lewat kabel (WAJIB, sekali per alat)

Fitur upload lewat WiFi baru ada setelah program ini masuk ke alat,
jadi upload pertama harus pakai kabel.

### LINGO001
1. Colokkan **LINGO001** ke laptop pakai kabel USB.
2. Di VS Code, klik ikon **PlatformIO** (kepala semut) di sebelah kiri.
3. Buka **Project Tasks → lingo001 → General → Upload**.
4. Tunggu sampai muncul tulisan **SUCCESS**.
5. Klik **Monitor** (di bawah Upload) untuk melihat log. Setelah LINGO tersambung WiFi,
   akan muncul tulisan:
   ```
   [OTA] Siap di lingo001.local (192.168.x.x)
   ```
   Catat angka IP-nya, siapa tahu dibutuhkan nanti.
6. Cabut kabel.

### LINGO002
Ulangi langkah yang sama, tetapi colokkan **LINGO002** dan pilih **lingo002 → Upload**.
Log yang muncul: `[OTA] Siap di lingo002.local (...)`.

---

## Tahap B — Update berikutnya lewat WiFi (tanpa kabel)

1. **Nyalakan LINGO** dan tunggu sampai terdengar *"Hore, LINGO sudah terhubung!"*.
2. **Sambungkan laptop ke WiFi yang sama** dengan LINGO.
3. Pastikan LINGO **tidak sedang mode istirahat**. Kalau sudah tidur, tekan tombol
   mikrofon sekali untuk membangunkannya, lalu tunggu sampai tersambung WiFi lagi.
4. Di VS Code → PlatformIO → **Project Tasks**:
   - untuk LINGO001: **lingo001-ota → General → Upload**
   - untuk LINGO002: **lingo002-ota → General → Upload**
5. Tunggu sampai progresnya **100%** dan muncul **SUCCESS**.
   LINGO akan restart sendiri dengan program baru.
6. **Jangan matikan LINGO selama upload berjalan.**

Kalau lebih suka lewat Terminal:

```bash
~/.platformio/penv/bin/pio run -e lingo001-ota -t upload
```

```bash
~/.platformio/penv/bin/pio run -e lingo002-ota -t upload
```

---

## Kalau gagal

| Pesan / masalah | Penyebab | Solusi |
|---|---|---|
| `No response from device` atau `lingo001.local` tidak ditemukan | Laptop dan LINGO beda WiFi, atau LINGO sedang tidur | Cek WiFi laptop, bangunkan LINGO dengan tombol mikrofon |
| Tetap tidak ditemukan padahal WiFi sudah sama | Beberapa hotspot HP / WiFi sekolah memblokir nama `.local` | Pakai IP: di `platformio.ini`, ganti sementara `upload_port = lingo001.local` menjadi IP dari Tahap A (contoh `upload_port = 192.168.1.23`) |
| WiFi kampus/sekolah tetap tidak bisa | Jaringan memblokir komunikasi antar perangkat | Pakai hotspot HP atau router rumah |
| `Authentication Failed` | Password di `main.cpp` dan `platformio.ini` berbeda | Samakan password. Kalau password di alat sudah terlanjur beda, upload ulang lewat kabel (Tahap A) |
| Upload putus di tengah | Sinyal lemah atau LINGO mati | Ulangi upload. Kalau LINGO tidak mau menyala normal, upload ulang lewat kabel |

**Cek IP LINGO kapan saja:** colokkan kabel, buka **Monitor**, ketik `s` lalu Enter.
Baris `IP:` menunjukkan alamatnya.

---

## Menambah alat baru (misalnya LINGO003)

1. Di `platformio.ini`, salin blok `[env:lingo002]` dan `[env:lingo002-ota]`,
   lalu ganti semua `lingo002` / `LINGO002` menjadi `lingo003` / `LINGO003`.
2. Daftarkan LINGO003 di dashboard (buat QR).
3. Lakukan Tahap A memakai env `lingo003`.
