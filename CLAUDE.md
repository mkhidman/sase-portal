# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> `AGENTS.md` adalah dokumen acuan lengkap projek (daftar fitur per fase, terminologi, tabel routing, daftar RPC). Baca file itu untuk detail fitur. CLAUDE.md ini fokus pada perintah, arsitektur, dan invarian yang mudah dilanggar.

## Bahasa

Seluruh teks UI, pesan error user-facing, nama migration, komentar, README, dan CHANGELOG memakai **Bahasa Indonesia**. Identifier internal (tipe TS, nama tabel, route) tetap Inggris/`jamaah` sesuai kode yang ada.

## Perintah

```bash
npm install
cp .env.example .env          # atau: copy .env.example .env (Windows)
npm run dev                   # vite dev server di :5173 (service worker TIDAK aktif)
npm test                      # penjalan tes bawaan Node, tanpa dependency
npm run typecheck             # tsc -b --pretty false
npm run build                 # tsc -b && vite build → dist/
npm run preview               # satu-satunya cara menguji PWA/offline secara lokal
```

Tidak ada linter atau formatter. **Verifikasi perubahan = `npm test` + `npm run typecheck`** (atau `npm run build`, yang menjalankan typecheck lebih dulu).

Tes memakai penjalan bawaan Node, tanpa dependency: berkas `*.test.ts` di `src/`. Hanya fungsi murni di `src/lib/` yang diuji — tidak ada perender komponen. Satu berkas tes, satu aturan bisnis; utamakan aturan yang kalau rusak tidak memunculkan error, hanya mengubah angka laporan diam-diam.

Mode demo (`VITE_DEMO_MODE=true`) menjalankan aplikasi tanpa Supabase sama sekali, memakai `src/data/demo.ts` + localStorage. Ini cara tercepat menguji perubahan UI tanpa backend.

## Arsitektur

Alur data satu arah, tidak ada state library:

```
pages/  →  DataContext / AuthContext  →  data/repository.ts  →  Supabase RPC/Edge Function
                                                            └→  data/demo.ts (VITE_DEMO_MODE)
```

- **`src/data/repository.ts`** (≈870 baris) adalah **satu-satunya** lapisan akses data. Tiap fungsi bercabang di `isDemoMode` lebih dulu. Jangan pernah memanggil `supabase` langsung dari page atau context.
- **`src/contexts/DataContext.tsx`** (≈740 baris) memegang seluruh state aplikasi (`BootstrapData`, 16+ koleksi) dan semua fungsi mutasi. Pola tiap mutasi: validasi aturan bisnis → panggil repository → update state lokal → `saveBootstrapCache`/`persistDemo`. Page tidak pernah menyimpan salinan data server.
- **Bootstrap sekali per sesi**: `loadBootstrap(user)` menarik semua tabel paralel dengan `fetchAllRows` (pagination 500 baris). Reload penuh hanya terjadi saat mount, kembali online, atau event Supabase Realtime. Tidak ada fetch per-halaman.
- **Kompatibilitas skema**: hasil query yang gagal dengan kode `42P01`/`PGRST205` (tabel belum ada) sengaja diabaikan agar instance yang belum menjalankan migration terbaru tetap jalan. Pertahankan pola ini saat menambah tabel baru.
- **Routing** (`src/App.tsx`): semua halaman kecuali Login/Dashboard di-`lazy()`, lalu **di-prefetch diam-diam 2,5 detik setelah render pertama** — ini disengaja supaya service worker menyimpan seluruh chunk untuk mode offline. Menambah halaman berarti menambah entri di objek `loaders`, bukan sekadar `lazy()` inline.
- Guard bersarang: `ProtectedRoute` → `PasswordReadyRoute` (paksa ganti password sementara) → `AppLayout` → `SuperadminRoute` untuk menu khusus Superadmin.

## Invarian yang harus dijaga

- **Validasi ganda.** Setiap aturan bisnis hidup di dua tempat: frontend (DataContext) dan database (RPC security definer + RLS). Jangan menghapus salah satunya "karena redundan".
- **Mutasi multi-tabel wajib lewat RPC**, bukan beberapa query dari client. RPC yang ada: `save_jamaah_record`, `bulk_import_jamaah`, `save_attendance_session_complete`, `save_family_record`, `save_linked_guardian_contact`, `bulk_transition_jamaah_classes`, `change_jamaah_active_status`, `merge_jamaah_duplicates`, `record_current_login`, `complete_password_change`.
- **Perubahan aturan harus disalin ke jalur demo.** Logika merge/simpan versi client ada di `src/lib/` (`mergeJamaah.ts`, dsb.). Mengubah RPC tanpa mengubah pasangan demo-nya membuat dua mode berperilaku berbeda.
- **Laporan historis memakai snapshot, bukan data terkini.** `jamaahSnapshotsAsOfDate()` (`src/lib/utils.ts`) memutar mundur `class_membership_history` + `jamaah_status_history` untuk merekonstruksi kelas, kategori sensus, dan status aktif pada tanggal tertentu. Laporan bulanan/rekap yang membaca `jamaah` langsung akan berubah retroaktif setiap kali ada kenaikan kelas atau pengarsipan — itu bug.
- **Nilai turunan bersama disediakan DataContext, bukan dibangun ulang per halaman.** `classNameMap` (id kelas ke nama) sudah ada di context. Jangan menulis `new Map(classes.map(...))` lagi di halaman.
- **Perhitungan yang tampil di lebih dari satu halaman tinggal di `src/lib/utils.ts`.** `averageAttendanceRate()` dan `materialProgressFor()` dipakai bersama Dashboard dan Rekap. Menyalinnya ke halaman baru berarti dua halaman bisa menampilkan angka berbeda untuk hal yang sama tanpa ada yang menangkapnya.
- **Jangan memotret warga satu per satu di dalam perulangan.** Pakai `jamaahSnapshotsAsOfDate(daftar, ...)` untuk sebuah daftar, atau `buildJamaahHistoryIndex()` sekali di luar perulangan lalu `jamaahSnapshotFromIndex()` di dalamnya. Memanggil snapshot per orang dengan array riwayat mentah membuat biayanya jumlah warga dikali panjang riwayat.
- **Absensi memakai optimistic locking.** `saveAttendance` selalu mengirim `expectedRevision`; database melempar `ATTENDANCE_CONFLICT` jika `revision` sudah berubah. Jangan menyimpan tanpa revision.
- **Pengajian Umum memicu rekap otomatis.** Kelas dengan nama `GENERAL_ATTENDANCE_CLASS_NAME` (`src/lib/generalAttendance.ts`) membuat sesi turunan untuk Pra Remaja/Remaja/Pra Nikah **hanya hari Senin & Rabu** (`isGeneralAttendanceBreakdownDay`). Sesi turunan ditandai `generatedFromSessionId` dan read-only.
- **Periode tertutup mengunci bulan itu** (jadwal, absensi, follow-up, materi, status, kelas). Cek `isPeriodClosed(month)` sebelum mutasi operasional.
- **Tanggal internal `YYYY-MM-DD`** via `localIsoDate()`. Tanggal lahir dan tanggal efektif tidak boleh di masa depan.

## Menambah fitur yang menyentuh tabel

Checklist minimum (urut):

1. Migration baru `supabase/migrations/0NN_*.sql` — **jangan mengedit migration lama yang sudah ter-deploy**; nomor berurutan (saat ini sampai `022_drop_meeting_notes.sql`).
2. Daftarkan tabel ke publication `supabase_realtime` di migration tersebut.
3. Tambah tipe di `src/types/domain.ts` (semua tipe domain terpusat di sini).
4. Tambah koleksi ke `BootstrapData` + query di `loadBootstrap` + fungsi mutasi di `repository.ts` (dua cabang: Supabase & demo).
5. Sambungkan di `DataContext` (state + fungsi mutasi + update cache offline).
6. Update `README.md` dan `CHANGELOG.md`; catat instruksi deploy migration di `SUPABASE_UPDATE.md`.

Edge Functions di-deploy terpisah: `supabase functions deploy <nama> --no-verify-jwt` (`invite-admin`, `manage-admin`).

## Offline & PWA

`src/lib/offline.ts` menyimpan dua hal di localStorage, keduanya **per-user**: cache bootstrap (`sj-bootstrap-cache-v1:<userId>`, kedaluwarsa 24 jam) dan draft absensi (`sj-attendance-draft-v2:<userId>:<classId>:<date>:<materialType>:<materialName>`). Keduanya best-effort — kegagalan penulisan tidak boleh menggagalkan alur utama. Draft tersimpan lokal, tetapi **submit final tetap butuh koneksi** (tidak ada antrean background sync).

- `saveBootstrapCache()` mengembalikan `OfflineCacheStatus` (`ok` | `quota` | `failed`), bukan `void`. DataContext menyimpannya sebagai `offlineCacheStatus` dan AppLayout memunculkan peringatan. **Jangan kembalikan jadi menelan galat diam-diam** — mode offline yang mati tanpa pemberitahuan baru ketahuan saat pengguna sudah di lokasi tanpa sinyal.
- Saat penulisan cache gagal, cache lama **sengaja tidak dihapus**. `setItem` yang gagal tidak merusak nilai sebelumnya, dan data basi masih lebih berguna daripada tidak ada data.
- `sweepStaleAttendanceDrafts()` dipanggil sekali tiap pengguna di DataContext dan membuang draft yang lebih tua dari 30 hari. Tanpa ini draft yang ditinggalkan menumpuk selamanya, karena satu-satunya pembersih lain adalah tombol Keluar yang nyaris tidak pernah ditekan pada PWA.

Service worker (`public/sw.js`) hanya aktif di build produksi. **Sengaja tanpa `skipWaiting()` dan `clients.claim()`**: versi baru menunggu sampai seluruh tab aplikasi ditutup. Mengambil alih tab yang sedang terbuka membuat halaman itu menjalankan kode lama sementara potongan halaman miliknya sudah dihapus dari cache pada `activate`, sehingga menu yang ditekan tepat sesudah deploy bisa gagal dimuat. Konsekuensinya user perlu menutup semua tab (atau hard-refresh) agar versi baru aktif — itu memang harga yang dipilih.

## Gaya kode

CSS murni di `src/styles.css` (tanpa Tailwind/CSS-in-JS). Arrow function components dengan named export, import type terpisah, indentasi 2 spasi, tanpa semicolon. Tanpa komentar kecuali di tempat yang benar-benar krusial — ikuti file terdekat.

## Kondisi saat ini

Backup JSON bisa diunduh tetapi restore belum ada. Modul Notulensi Musyawarah sudah dihapus (migration 022).
