# Update Supabase Terbaru

Untuk project yang sebelumnya sudah menjalankan migration 001–022, jalankan delapan migration berikut melalui Supabase SQL Editor, berurutan:

```text
supabase/migrations/023_musyawarah.sql
supabase/migrations/024_schedule_time_range.sql
supabase/migrations/025_meeting_topic_wording.sql
supabase/migrations/026_akses_wali.sql
supabase/migrations/027_wali_token_tanpa_pgcrypto.sql
supabase/migrations/028_wali_rentang_tampilan.sql
supabase/migrations/029_rls_sekali_per_statement.sql
supabase/migrations/030_lepas_kelas_dan_kategori.sql
```

## Migration 030 (Lepas dari kelas + ubah kategori)

Menambah nilai `release` pada `change_type`, dan membuat ulang `bulk_transition_jamaah_classes` dengan satu parameter baru `target_census_category` serta kelas tujuan yang boleh `null`.

- **Tidak ada tabel atau kolom baru.** `class_membership_history` sejak migration 008 sudah mengizinkan `to_class_id` null, dan check constraint-nya hanya menuntut salah satu dari `from_class_id`/`to_class_id` terisi. Peristiwa pelepasan kelas sudah terwakili apa adanya.
- **Fungsi lamanya di-`drop` lebih dulu.** Parameternya bertambah satu, jadi `create or replace` saja akan meninggalkan dua fungsi bernama sama dengan tanda tangan berbeda, dan PostgREST bisa memanggil yang keliru.
- **Nama check constraint dicari dari katalog**, tidak ditebak. Kalau namanya ternyata berbeda dari dugaan, `drop constraint if exists` akan lewat tanpa keluhan, constraint lama tetap hidup, dan setiap pelepasan kelas gagal dengan `violates check constraint` yang tidak jelas asalnya.
- Perilaku kenaikan dan mutasi kelas yang lama **tidak berubah**: dengan kelas tujuan terisi, jalurnya persis seperti sebelumnya.
- Frontend lama tetap berjalan setelah migration ini (parameter barunya punya default), tetapi frontend baru **tidak** berjalan tanpa migration ini — pemanggilan dengan 8 argumen akan gagal dengan `PGRST202`.

## Migration 029 (Policy baca sekali per statement)

Membuat ulang policy `select` pada tabel yang ikut bootstrap, menambah fungsi `managed_class_ids()`, dan menambah indeks `attendance_records(jamaah_id)`. **Tidak ada tabel, kolom, atau aturan akses yang berubah** — hanya bentuk ekspresinya.

Alasannya: helper RLS yang ada (`is_superadmin`, `can_manage_class`, `jamaah_in_managed_class`, `jamaah_in_managed_attendance_history`, `family_in_managed_class`) semuanya `stable` tetapi berparameter, sehingga Postgres memanggilnya untuk **setiap baris**. Satu baris `attendance_records` memicu satu subquery ke `attendance_sessions` plus satu lookup ke `profiles`; policy `jamaah` memanggil tiga helper bersarang per warga. Pada bootstrap yang menarik seluruh tabel, biayanya jumlah baris dikali kedalaman helper.

Bentuk penggantinya memakai subquery tanpa acuan ke baris luar, yang direncanakan sebagai InitPlan: dihitung sekali per statement, lalu dipakai sebagai hash.

- **Jalankan di dalam transaksi uji lebih dulu.** Tempel seluruh isi berkas di SQL Editor dibungkus `begin;` … `rollback;` untuk memastikan semuanya ter-parse di instance ini, lalu jalankan ulang tanpa pembungkus itu. Satu policy yang gagal di tengah berkas akan meninggalkan sebagian tabel tanpa policy `select` — artinya tabel itu terbaca kosong oleh semua Admin.
- **Verifikasi dengan akun Admin, bukan Superadmin.** Superadmin lolos lewat cabang pertama setiap policy, jadi pengujiannya tidak membuktikan apa pun tentang cabang kelas. Bandingkan jumlah baris yang terlihat sebelum dan sesudah: jumlah warga, jadwal, sesi absensi, keluarga, dan tindak lanjut harus sama persis.
- Nama policy-nya **sengaja dipertahankan** seperti aslinya (termasuk yang janggal seperti `merge history managed by superadmin` untuk policy `select`). Policy pada satu tabel bersifat OR; membuat policy baru dengan nama baru tanpa menghapus yang lama berarti bentuk lamanya tetap dievaluasi dan tidak ada yang lebih cepat.
- Policy **tulis** tidak disentuh, dan helper lamanya tidak dihapus karena masih dipakai policy tulis serta beberapa RPC.
- Tabel kecil yang dipakai `is_account_active(auth.uid())` (`study_classes`, `reporting_periods`) dibiarkan apa adanya: barisnya terlalu sedikit untuk terasa.

## Migration 028 (Rentang tampilan Akses Wali)

Menambah tiga kolom pada `wali_access` (`window_preset`, `from_month`, `to_month`), RPC baru `set_wali_window`, dan membuat ulang `wali_attendance` agar batas tanggalnya dibaca dari baris itu.

- **Aman dijalankan walau tautan sudah tersebar.** Kolomnya `add column if not exists` dengan bawaan `'3-bulan'`, jadi setiap tautan yang sudah ada tetap menampilkan tiga bulan terakhir seperti sebelumnya. Token tidak disentuh sama sekali.
- `set_wali_window` **tidak memutar token**: mengubah rentang tidak mematikan tautan yang sudah dikirim ke orang tua. Hanya `set_wali_access` (tombol Tautan Baru) yang memutar token, dan fungsi itu tidak diubah di migration ini.
- Batas tanggalnya kini selalu **bulan penuh**. Versi 026 memakai `current_date - interval '3 months'`, yang memotong bulan tertua di tengah; halaman wali mengelompokkan absensi per bulan, jadi bulan separuh itu terbaca seperti absensi yang hilang.
- Aturan rentangnya **wajib sama** dengan `waliWindowRange()` di `src/lib/wali.ts`. Kalau hanya satu yang diubah, mode demo dan Supabase menampilkan periode yang berbeda tanpa satu pun error.
- Frontend baru tetap berjalan bila migration ini belum dijalankan: query `wali_access` menoleransi `42703`, jadi daftar tautannya hanya tampil kosong sampai migration-nya masuk.
- `wali_access` tetap **tidak** didaftarkan ke publication `supabase_realtime`.

## Migration 027 (Perbaikan pembuat token wali)

**Wajib dijalankan bila 026 sudah terpasang.** Tanpa migration ini, tombol Aktifkan Akses selalu gagal dengan:

```json
{"code":"42883","message":"function gen_random_bytes(integer) does not exist"}
```

`pgcrypto` memang aktif, tetapi Supabase memasangnya di schema `extensions`, sementara fungsi ini memakai `set search_path = public` demi keamanan. `gen_random_uuid()` pada migration 001 lolos karena itu fungsi bawaan inti Postgres, bukan milik pgcrypto — itu sebabnya kekeliruan ini tidak muncul di migration mana pun sebelumnya.

Token kini disusun dari dua `gen_random_uuid()`: 64 digit heksadesimal (~244 bit), sudah aman untuk URL tanpa dibersihkan. Dipilih daripada menambahkan `extensions` ke `search_path` supaya tidak ada asumsi tentang di schema mana sebuah ekstensi kebetulan dipasang.

Hanya badan fungsi `set_wali_access` yang berubah (`create or replace`). Tabel, RLS, dan `wali_attendance` tidak tersentuh. Tautan yang sudah dibuat sebelum migration ini tetap berlaku — tidak ada yang pernah berhasil dibuat, karena fungsinya memang selalu gagal.

## Migration 026 (Akses Wali)

Membuat tabel `wali_access` dan dua RPC: `set_wali_access` (Superadmin) dan `wali_attendance` (dapat dipanggil `anon`).

- `wali_attendance` adalah **satu-satunya** fungsi di projek ini yang diberi `grant execute ... to anon`. Itu memang disengaja: halaman `/wali/<token>` dibuka orang tua tanpa akun. Fungsinya mengembalikan `null` untuk token yang tidak dikenal, dan datanya dibatasi tiga bulan terakhir serta hanya warga aktif.
- Token ditaruh di tabel terpisah, **bukan** kolom baru di `jamaah`. Pemicu audit pada migration 013 menyimpan `to_jsonb(new)` seluruh baris dan `merge_jamaah_duplicates` menyimpan `select *` sebagai `duplicate_snapshot`; kolom di `jamaah` berarti token ikut terbawa ke `audit_logs` dan backup JSON.
- `wali_access` **tidak** didaftarkan ke publication `supabase_realtime`. Tidak ada klien yang berlangganan tabel ini, dan menyiarkan baris berisi token tidak ada gunanya.
- RLS tabelnya hanya mengizinkan `select` oleh Superadmin; tidak ada policy tulis sama sekali, karena seluruh perubahan lewat `set_wali_access`.
- Migration ini aman dijalankan berulang (`create table if not exists` + `create or replace`). Frontend baru tetap berjalan bila migration ini belum dijalankan: query `wali_access` di `loadBootstrap` menoleransi kode `42P01`/`PGRST205`, jadi tombol Akses Wali hanya gagal saat ditekan.

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
