# Update Supabase untuk Relasi Wali

Jalankan migration berikut melalui Supabase SQL Editor:

```text
supabase/migrations/017_link_guardians_to_jamaah.sql
```

Migration ini menambahkan tautan dari wali ke data warga, pencarian wali berdasarkan Data Sensus, hubungan `Diri Sendiri`, sinkronisasi otomatis nama/nomor, dan perlindungan tautan saat data duplikat digabung.

Migration 001–016 tidak perlu dijalankan kembali. Edge Function tidak perlu di-deploy ulang. Frontend baru harus dipublikasikan setelah migration 017 aktif karena repository menggunakan RPC `save_linked_guardian_contact`. Setelah deployment, lakukan refresh penuh untuk mengganti cache service worker.
