# Pendaftaran satu LINGO untuk satu profil anak

Alur awal yang ditambahkan:

1. Buat QR **produksi** untuk setiap unit LINGO:

   ```bash
   cd /path/to/LINGO/backend
   node scripts/create-device-qr.js LINGO002 https://https://lingo-dashboard.onrender.com/
   ```

   Ganti alamat tersebut dengan domain dashboard HTTPS yang benar-benar sudah
   dipublikasikan. Perintah produksi memerlukan `firebase-service-account.json`
   di folder backend dan mendaftarkan kode aktivasi di koleksi Firestore
   `deviceActivations`. Pasang QR dari `backend/private/LINGO002-activation.png`
   pada perangkat yang ID firmware-nya `LINGO002`. QR produksi bersifat rahasia;
   folder/file-nya tidak dimasukkan ke git.

2. Orang tua scan QR memakai kamera HP, mengisi nama dan umur anak, lalu memilih
   **Daftarkan LINGO**.
3. Backend membuat profil dan pasangan `devices/{device_id}` secara atomik.
   Dokumen aktivasi langsung ditandai `claimed`, sehingga QR tidak dapat dipakai
   untuk memasangkan unit itu dengan profil lain.
4. Browser menyimpan ID profil di `localStorage` untuk menampilkan data profil,
   dashboard, riwayat, dan laporan.
5. Upload sesi mengidentifikasi perangkat lewat `device_id`. Backend mengambil
   `user_id` dari pasangan Firestore; `user_id` kiriman perangkat tidak dipercaya.

## QR contoh

`backend/examples/LINGO-DEMO-001-activation.png` adalah contoh tampilan/payload.
QR contoh sengaja **tidak aktif di Firestore** dan memakai domain contoh. Membuat
salinan QR produksi yang aktif harus dilakukan dengan perintah produksi di atas.

Untuk membuat QR contoh lagi:

```bash
node scripts/create-device-qr.js LINGO-DEMO-001 https://your-site.example --example
```

Mode `--example` hanya membuat file, tidak membuat aktivasi Firestore.

## Konfigurasi yang masih dibutuhkan di perangkat

- Set `DEVICE_ID` pada firmware setiap perangkat ke ID yang sama dengan QR,
  misalnya `LINGO002`.
- Agar firmware dapat mengunggah, aktifkan koneksi WiFi dan atur `serverURL`
  ke URL backend HTTPS produksi. Konfigurasi saat ini di
  `esp32/LINGO-ESP32/platformio.ini` menonaktifkan WiFi, dan firmware saat ini
  masih mengirim ID tetap. Pendaftaran QR **tidak otomatis mengubah firmware**.
- Isi field `correct`, `wrong`, `accuracy`, dan `duration` firmware dengan hasil
  sesi sungguhan sebelum mengandalkan laporan dashboard.

## Batas keamanan versi awal

Halaman QR membuat profil tanpa login dan ID profil disimpan di browser. Artinya
pairing satu perangkat dijaga di server, tetapi autentikasi orang tua, pemulihan
akun, berbagi akses antar-browser, dan otorisasi privat untuk endpoint profil /
sesi belum tersedia. Siapkan Firebase Authentication dan pemeriksaan token pada
API sebelum memakai data ini sebagai layanan produksi untuk data anak. Kode
aktivasi adalah bearer secret: hanya bagikan QR kepada pemilik perangkat.