# Update Supabase Terbaru

Untuk project yang sebelumnya sudah menjalankan migration 001–022, jalankan tiga migration berikut melalui Supabase SQL Editor, berurutan:

```text
supabase/migrations/023_musyawarah.sql
supabase/migrations/024_schedule_time_range.sql
supabase/migrations/025_meeting_topic_wording.sql
```

## Migration 025 (Istilah Bahasan & Keputusan)

Membuat ulang RPC `save_meeting_record` dengan **dua pesan galat** yang berubah mengikuti istilah baru di antarmuka:

- `Notulensi harus memuat minimal satu masalah.` menjadi `Notulensi harus memuat minimal satu bahasan.`
- `Masalah wajib diisi pada setiap bahasan.` menjadi `Setiap bahasan wajib diisi keterangannya.`

Selebihnya isi fungsinya identik dengan migration 023. Kolom `problem` dan `solution` **tidak** diganti nama: identifier internal memang tetap Inggris di projek ini, dan mengganti nama kolom berarti menyentuh tabel, RPC, serta seluruh pemetaan di `repository.ts` untuk hasil yang tidak terlihat sedikit pun di layar.

Pesan di RPC wajib sama persis dengan yang ada di `DataContext.saveMeeting`. Kalau berbeda, pengguna melihat dua kalimat berlainan untuk kesalahan yang sama, tergantung validasi mana yang kebetulan menangkapnya lebih dulu.

Migration 025 aman dijalankan berulang kali (`create or replace`). Tidak ada tabel, kolom, RLS, atau data yang berubah. Frontend baru tetap berjalan bila migration ini belum dijalankan — hanya saja pesan galat dari server masih memakai kata "masalah" sementara layarnya sudah berkata "bahasan".

## Migration 024 (Jam mulai & jam selesai jadwal)

Menambahkan kolom `start_time` dan `end_time` bertipe `time` pada tabel `schedules`.

- Keduanya **nullable**. Jadwal lama tetap utuh dan tampil tanpa jam; tidak ada default yang mengarang jam `00:00`.
- Constraint `schedules_time_range_valid` menolak jam selesai yang mendahului jam mulai. Pasangan kembarnya ada di `DataContext.saveSchedule`.
- Tidak ada RLS atau RPC yang berubah: penyimpanan jadwal memang lewat `upsert` langsung ke tabel, dan policy 015/021 sudah mencakup kolom baru.
- `schedules` sudah terdaftar di publication `supabase_realtime` sejak migration 002; penambahan kolom tidak perlu mendaftarkannya ulang.

Migration 024 aman dijalankan berulang kali (`add column if not exists` / `drop constraint if exists`). Frontend baru tetap berjalan bila migration ini belum dijalankan — kolom jam akan selalu kosong dan penyimpanan jadwal dengan jam akan gagal, sisanya normal.

## Migration 023 (Musyawarah)

Membuat modul Musyawarah yang baru. Tabelnya memakai nama baru dan **tidak** memulihkan data notulensi lama — isi tabel lama sudah hilang permanen sejak migration 022.

- Tabel `meetings` (judul, tanggal), `meeting_topics` (bahasan dan keputusannya, milik satu musyawarah), dan `meeting_tasks` (tugas, penanggung jawab, batas tanggal, waktu selesai).
- Ketiganya didaftarkan ke publication `supabase_realtime`.
- RLS: seluruh pengguna terautentikasi dapat membaca; hanya Superadmin yang dapat menulis.
- RPC `save_meeting_record(uuid, text, date, jsonb)` menyimpan satu notulensi beserta bahasan dan tugasnya dalam satu transaksi. Baris yang sudah ada diperbarui, bukan dihapus lalu disisipkan ulang, agar centang `done_at` tidak ikut terhapus setiap kali notulensi disunting.
- Trigger `meetings_closed_period_guard` menolak perubahan notulensi pada bulan yang periodenya sudah ditutup. `meeting_tasks` sengaja **tidak** dijaga trigger ini: tugas dari musyawarah bulan lalu masih dikerjakan bulan ini.
- Trigger audit dipasang pada `meetings` bila `write_audit_log()` sudah ada.
- `pic_jamaah_id` memakai `on delete restrict`: warga yang masih memegang tugas musyawarah tidak dapat dihapus dari tabel `jamaah`.

Migration 023 aman dijalankan berulang kali (memakai `if not exists` / `drop ... if exists`). Edge Function tidak perlu di-deploy ulang.

Jalankan migration **sebelum atau bersamaan dengan** publikasi frontend baru. Frontend baru tetap berjalan bila tabelnya belum ada (query yang gagal dengan kode `42P01`/`PGRST205` diabaikan), hanya saja halaman Musyawarah akan kosong dan penyimpanan gagal.

Setelah deployment, lakukan refresh penuh untuk mengganti cache service worker.

## Riwayat: migration 022 (menghapus modul Notulensi lama)

Migration 022 menghapus tabel `meeting_notes`, `meeting_note_participants`, `meeting_note_actions`, fungsi `save_meeting_note_record`, serta enum `meeting_action_status` dan `meeting_note_status` **secara permanen**. Isinya tidak dapat dipulihkan dan tidak tercakup backup JSON aplikasi. Migration 023 membuat modul baru dengan nama tabel yang berbeda, bukan memulihkan yang lama.

## Riwayat: migration 021 (Admin dapat mengubah & membatalkan jadwal)

- Policy `schedules updated within access` dan `schedules deleted within access` pada tabel `schedules`, keduanya dibatasi `public.can_manage_class(class_id)`.
- Sebelumnya Admin hanya memiliki policy insert (migration 015), sehingga jadwal yang salah tanggal atau salah kelas menjadi permanen dan terus muncul pada daftar "Belum diabsen".
- Superadmin tidak terpengaruh: policy `schedules managed by superadmin` dari migration 001 tetap berlaku.
- Klausa `with check` pada policy update mencegah Admin memindahkan jadwal ke kelas yang tidak diampunya.

## Riwayat: migration 020 (Notulensi Musyawarah)

Migration 020 membuat tabel, enum, RPC, dan policy untuk Notulensi Musyawarah. File-nya **sengaja dipertahankan** di repositori sebagai riwayat migration yang sudah ter-deploy — instalasi baru tetap menjalankan 020 secara berurutan, lalu dibatalkan oleh 022. Jangan menghapus atau mengedit file 020.
