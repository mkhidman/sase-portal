# Update Supabase Terbaru

Untuk project yang sebelumnya sudah menjalankan migration 001–017, jalankan kedua migration berikut secara berurutan melalui Supabase SQL Editor:

```text
supabase/migrations/018_general_attendance_breakdown.sql
supabase/migrations/019_general_attendance_weekday_statuses.sql
```

Jika migration 018 sudah pernah dijalankan, cukup jalankan migration 019.

Migration 018 menambahkan relasi sesi otomatis. Migration 019 membatasi sinkronisasi pada Pengajian Umum hari Senin dan Rabu serta menyalin seluruh status Hadir, Izin, Sakit, dan Alpa ke rekap Pra Remaja, Remaja, serta Pra Nikah. Data otomatis yang sudah ada ikut disinkronkan ulang; rekap pada hari selain Senin/Rabu akan dibersihkan.

Migration 001–017 tidak perlu dijalankan kembali. Edge Function tidak perlu di-deploy ulang. Jalankan migration yang diperlukan sebelum memublikasikan frontend baru karena repository membaca kolom `generated_from_session_id`. Setelah deployment, lakukan refresh penuh untuk mengganti cache service worker.
