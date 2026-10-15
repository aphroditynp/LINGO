# Administrator LINGO

Dashboard menyediakan tab **Administrator** pada `/admin`. Login dan seluruh
endpoint pengelolaan diperiksa oleh backend; menyembunyikan tab atau mengganti
isi browser tidak memberikan akses admin.

## Konfigurasi kredensial

Sebelum deploy backend, atur tiga environment variable privat di layanan hosting
backend (atau di `backend/.env` untuk pengembangan lokal):

- `ADMIN_USERNAME`: satu username administrator yang Anda pilih.
- `ADMIN_PASSWORD`: password unik dan kuat yang Anda pilih.
- `ADMIN_TOKEN_SECRET`: secret acak minimal 32 karakter, misalnya hasil
  `openssl rand -base64 48`.

`backend/.env.example` hanya berisi placeholder. Jangan menaruh kredensial
sungguhan di repository, source frontend, atau chat. Login akan mengembalikan
HTTP 503 sampai ketiga nilai diatur. Token sesi berlaku 8 jam. Percobaan login
yang salah dibatasi sementara setelah lima kegagalan dari alamat IP yang sama.

## Fitur

- Melihat profil pengguna dan pasangan perangkat LINGO dari Firestore.
- Mengubah LINGO ID, mengganti User ID pasangan, dan memperbarui referensi
  sesi/aktivasi untuk perangkat tersebut. Jika identitas perangkat fisik ikut
  diganti, firmware perangkat dan QR aktivasi juga perlu disesuaikan.
- **Reset User ID** membuat ID profil baru, mempertahankan data profil,
  memindahkan referensi perangkat dan riwayat sesi, serta menyimpan alias agar
  browser yang masih menyimpan ID lama tetap dapat mengambil profil dan riwayat.

Migrasi ID melewati beberapa batch Firestore bila datanya banyak; jangan
mematikan server saat migrasi. Error migrasi parsial ditampilkan di dashboard
dan dicatat pada log backend.