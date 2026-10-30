# MultiView Keluarga

Starter project Next.js untuk dashboard MultiView. Bisa di-deploy ke Vercel.

## Fitur versi awal
- Tambah hingga 80 tautan sumber.
- Mendukung YouTube video/live yang memiliki ID video dan tautan video TikTok yang memiliki `/video/ID`.
- Daftar tersimpan di `localStorage` browser.
- Pilih 1, 2, atau 3 kolom player.
- Hapus sumber satu per satu atau kosongkan semua.
- Layout responsif untuk ponsel dan desktop.

## Batasan penting
- Ini adalah dashboard embed, bukan pengambil stream. Tautan YouTube/TikTok harus dapat di-embed menurut kebijakan platform.
- TikTok LIVE dan halaman profil tidak otomatis dapat diputar melalui embed resmi. TikTok embed pada starter ini ditujukan untuk tautan video yang memiliki `/video/ID`.
- Browser dan kebijakan platform dapat membatasi autoplay, suara, atau jumlah player yang berjalan bersamaan. Mulai dengan 2-4 player, bukan langsung 80.
- Tombol SYNC LIVE hanya memuat ulang halaman pada versi awal; sinkronisasi waktu antar player memerlukan integrasi player API yang lebih lanjut.
- Data disimpan di browser perangkat yang digunakan. Belum ada login atau sinkronisasi daftar antar perangkat karena Supabase belum dipasang.

## Jalankan di komputer
Butuh Node.js versi LTS.

```bash
npm install
npm run dev
```
Buka http://localhost:3000.

## Deploy ke Vercel
1. Upload folder project ini ke repository GitHub.
2. Masuk ke Vercel dan pilih **Add New → Project**.
3. Import repository GitHub tersebut.
4. Framework akan terdeteksi sebagai Next.js. Biarkan pengaturan default.
5. Tekan **Deploy**.

Tidak membutuhkan Environment Variables untuk versi awal ini.
