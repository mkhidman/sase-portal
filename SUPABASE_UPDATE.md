# Update Supabase untuk Hardening Integritas

Jalankan migration berikut melalui Supabase SQL Editor:

```text
supabase/migrations/016_integrity_hardening.sql
```

Deploy atau perbarui dua Edge Function:

```bash
supabase functions deploy invite-admin --no-verify-jwt
supabase functions deploy manage-admin --no-verify-jwt
```

Migration ini menambahkan penyimpanan profil+kelas warga secara transaksional, penyimpanan absensi+ketuntasan materi dalam satu transaksi, perlindungan ketuntasan sesi utama, validasi kelas aktif, serta penolakan tanggal efektif masa depan.

Migration 001–015 tidak perlu dijalankan kembali. Frontend baru harus dipublikasikan setelah migration 016 aktif karena repository menggunakan RPC baru. Setelah deployment, lakukan refresh penuh untuk mengganti cache service worker.
