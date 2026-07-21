# Update Supabase untuk Fase 13

Jalankan migration berikut melalui Supabase SQL Editor:

```text
supabase/migrations/014_admin_account_management.sql
```

Deploy atau perbarui dua Edge Function:

```bash
supabase functions deploy invite-admin --no-verify-jwt
supabase functions deploy manage-admin --no-verify-jwt
```

Fase ini menambahkan status akun Admin, login terakhir, reset password sementara, wajib ganti password, pemindahan penugasan kelas, serta perlindungan agar kelas tidak kehilangan wali ketika akun dinonaktifkan.

Migration 001–013 tidak perlu dijalankan kembali. Setelah deployment, lakukan refresh penuh untuk mengganti cache service worker.
