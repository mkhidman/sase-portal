# Update Supabase Terbaru

Untuk project yang sebelumnya sudah menjalankan migration 001–021, jalankan satu migration berikut melalui Supabase SQL Editor:

```text
supabase/migrations/022_drop_meeting_notes.sql
```

## ⚠️ Migration 022 menghapus data secara permanen

Migration ini membongkar modul Notulensi Musyawarah karena fiturnya tidak jadi dipakai:

- Menghapus tabel `meeting_note_actions`, `meeting_note_participants`, dan `meeting_notes` beserta seluruh isinya, policy, index, dan trigger miliknya.
- Menghapus fungsi `save_meeting_note_record`.
- Menghapus tipe enum `meeting_action_status` dan `meeting_note_status`.

**Isi tabelnya tidak dapat dipulihkan.** Fitur backup JSON aplikasi (`Pengaturan → Unduh Backup`) tidak pernah menyertakan notulensi, jadi tidak ada salinan otomatis di mana pun. Bila isinya masih dibutuhkan, ekspor lebih dulu sebelum menjalankan migration:

```sql
select * from public.meeting_notes;
select * from public.meeting_note_participants;
select * from public.meeting_note_actions;
```

Fungsi `set_updated_at` sengaja tidak ikut dihapus karena masih dipakai tabel lain. Tabel yang dihapus otomatis terlepas dari publication `supabase_realtime`, jadi tidak ada langkah tambahan untuk Realtime.

Migration 022 aman dijalankan berulang kali (seluruh perintahnya memakai `if exists`). Edge Function tidak perlu di-deploy ulang.

Jalankan migration **setelah** frontend baru dipublikasikan, atau bersamaan. Frontend baru sudah tidak membaca tabel notulensi sama sekali, sedangkan frontend lama akan error bila tabelnya sudah hilang.

Setelah deployment, lakukan refresh penuh untuk mengganti cache service worker.

## Riwayat: migration 021 (Admin dapat mengubah & membatalkan jadwal)

- Policy `schedules updated within access` dan `schedules deleted within access` pada tabel `schedules`, keduanya dibatasi `public.can_manage_class(class_id)`.
- Sebelumnya Admin hanya memiliki policy insert (migration 015), sehingga jadwal yang salah tanggal atau salah kelas menjadi permanen dan terus muncul pada daftar "Belum diabsen".
- Superadmin tidak terpengaruh: policy `schedules managed by superadmin` dari migration 001 tetap berlaku.
- Klausa `with check` pada policy update mencegah Admin memindahkan jadwal ke kelas yang tidak diampunya.

## Riwayat: migration 020 (Notulensi Musyawarah)

Migration 020 membuat tabel, enum, RPC, dan policy untuk Notulensi Musyawarah. File-nya **sengaja dipertahankan** di repositori sebagai riwayat migration yang sudah ter-deploy — instalasi baru tetap menjalankan 020 secara berurutan, lalu dibatalkan oleh 022. Jangan menghapus atau mengedit file 020.
