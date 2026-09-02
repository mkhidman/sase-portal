# Update Supabase Terbaru

Untuk project yang sebelumnya sudah menjalankan migration 001–020, jalankan satu migration berikut melalui Supabase SQL Editor:

```text
supabase/migrations/021_schedule_update_delete.sql
```

Jika project masih berada di migration 019, jalankan `020_meeting_notes.sql` terlebih dahulu, lalu `021_schedule_update_delete.sql`.

Migration 021 mengizinkan Admin memperbaiki dan membatalkan jadwal:

- Policy `schedules updated within access` dan `schedules deleted within access` pada tabel `schedules`, keduanya dibatasi `public.can_manage_class(class_id)`.
- Sebelumnya Admin hanya memiliki policy insert (migration 015), sehingga jadwal yang salah tanggal atau salah kelas menjadi permanen dan terus muncul pada daftar "Belum diabsen".
- Superadmin tidak terpengaruh: policy `schedules managed by superadmin` dari migration 001 tetap berlaku.
- Klausa `with check` pada policy update mencegah Admin memindahkan jadwal ke kelas yang tidak diampunya.

Tidak ada perubahan tabel, enum, maupun publication. Migration 021 aman dijalankan berulang kali (memakai `drop policy if exists`). Frontend baru dapat dipublikasikan sebelum atau sesudah migration ini; tanpa migration, tombol ubah dan batalkan akan gagal dengan pesan izin dari Supabase bagi akun Admin, sedangkan Superadmin tetap berjalan normal.

## Riwayat: migration 020 (Notulensi Musyawarah)

Migration 020 menambahkan fitur Notulensi Musyawarah:

- Tabel `meeting_notes`, `meeting_note_participants`, dan `meeting_note_actions` beserta indeksnya.
- Tipe enum `meeting_note_status` (`draft`, `final`) dan `meeting_action_status` (`pending`, `in_progress`, `completed`).
- Row Level Security dengan akses baca untuk seluruh pengguna terautentikasi; seluruh perubahan data dilakukan lewat fungsi `save_meeting_note_record` (security definer).
- Validasi di database: judul dan tanggal musyawarah wajib diisi, peserta harus berasal dari data warga, tugas tindak lanjut wajib diisi, dan penanggung jawab tindak lanjut harus merupakan peserta musyawarah.
- Pendaftaran ketiga tabel ke publication `supabase_realtime` serta trigger `set_updated_at`.

Migration 001–019 tidak perlu dijalankan kembali. Edge Function tidak perlu di-deploy ulang. Migration 020 aman dijalankan berulang kali (memakai `if not exists` dan `create or replace`).

Jalankan migration sebelum memublikasikan frontend baru karena repository membaca tabel `meeting_notes`, `meeting_note_participants`, dan `meeting_note_actions` saat bootstrap. Setelah deployment, lakukan refresh penuh untuk mengganti cache service worker.
