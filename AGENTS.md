# AGENTS.md — Acuan untuk Agen AI di Projek SASE Portal

Dokumen ini adalah satu-satunya sumber ringkasan projek. Baca sebelum mengubah kode.
Bahasa antarmuka, kode, migration, dan dokumentasi projek seluruhnya **Bahasa Indonesia**.

---

## 1. Apa projek ini

**SASE Portal** (sebelumnya *Sensus Jamaah App*) adalah aplikasi web **Progressive Web App (PWA)** untuk administrasi warga pengajian sebuah komunitas (kelompok SASE). Aplikasi dipakai di smartphone dan desktop, termasuk saat offline, oleh dua peran:

- **Superadmin** — akses penuh ke semua modul dan semua kelas.
- **Admin / Wali Kelas** — hanya melihat dan mengisi data kelas yang diampunya (pembatasan via Row Level Security).

Versi terakhir: **0.13.2**. Fitur dibangun bertahap (fase 1–13) dan direkam di `CHANGELOG.md`.

### Cakupan fitur utama

1. **Data Warga (Sensus)** — CRUD, import massal CSV, kategori sensus (Balita, Caberawit, Pra Remaja, Remaja, Usia Nikah, Menikah, Duda & Janda), tanggal lahir opsional.
2. **Kelas Pengajian** — 12 kelas (Playgroup, PAUD, Caberawit A/B/C, Pra Remaja, Remaja, Pra Nikah, Pengajian Umum, Pengajian Ibu-Ibu, Pengajian Usia Istimewa, 5 Unsur).
3. **Jadwal & Absensi** — jadwal per kelas, absensi (Hadir/Izin/Sakit/Alpa), filter gender, materi sambung/keterangan, optimistic locking via `revision`, auto-generate rekap Pengajian Umum → Pra Remaja/Remaja/Pra Nikah (hari Senin & Rabu).
4. **Hasda & ASAD** — target ketuntasan per bulan per warga, penyusulan manual, ringkasan per gender.
5. **Tindak Lanjut Absensi** — deteksi risiko (<70% hadir / ≥4 Alpa / Alpa berturut), status follow-up, tombol WhatsApp, prioritas otomatis.
6. **Laporan Bulanan** — evaluasi per kelas per bulan, ekspor CSV & **PDF** (generated di browser), penutupan periode (penguncian data).
7. **Kenaikan & Mutasi Kelas** — transisi massal dengan histori, penyesuaian kategori sensus otomatis, rekonstruksi laporan historis.
8. **Status & Arsip Warga** — nonaktif/aktifkan dengan alasan & tanggal efektif, tanpa menghapus histori.
9. **Keluarga & Kontak Wali** — pengelompokan keluarga, banyak kontak wali per warga, wali ditautkan ke warga lain.
10. **Kualitas Data** — deteksi masalah (tanpa kelas, tanpa kontak, anak tanpa wali, TTL kosong, kategori/kelas tidak selaras, usia 55+ belum masuk Usia Istimewa) + deteksi kandidat duplikat.
11. **Penggabungan Data Duplikat** — merge 2 warga transaksional dengan aturan konflik (absensi: Hadir>Sakit>Izin>Alpa, dst), snapshot & riwayat.
12. **Notulensi Musyawarah** — notulensi rapat + tindak lanjut keputusan (penanggung jawab harus peserta).
13. **Manajemen Akun Admin** — buat/nonaktifkan Admin, reset password sementara, wajib ganti password, transfer penugasan kelas.

### Fitur lintas-fase (penting)

- **Realtime** — perubahan di database langsung memicu reload data (Supabase Realtime).
- **PWA / Offline** — installable, service worker, cache data terakhir per akun (24 jam), draft absensi lokal, indikator koneksi.
- **Audit trail** — Riwayat Aktivitas (`audit_logs`) untuk perubahan data penting.
- **Backup JSON** — download data lengkap dari Pengaturan.

---

## 2. Tech stack

| Bagian | Teknologi |
|---|---|
| Frontend | React 19, TypeScript 7, Vite 8, react-router-dom 7 |
| UI | CSS murni (`src/styles.css`, no Tailwind), ikon `lucide-react` |
| Tanggal | `date-fns` + locale `id` |
| Backend | Supabase (`@supabase/supabase-js` v2), PostgreSQL + RLS |
| Edge Functions | Supabase Functions `invite-admin`, `manage-admin` |
| Deployment | Vite build → static (vercel.json SPA rewrite), Supabase cloud |
| Package manager | npm (`.npmrc` mengarah ke registry publik npm) |

**Script (`package.json`):** `npm run dev`, `npm run build` (= `tsc -b && vite build`), `npm run preview`, `npm run typecheck` (= `tsc -b --pretty false`).

---

## 3. Arsitektur & pola kode

Lapisan (alur data utama):

```
pages (src/pages)  →  contexts (DataContext/AuthContext)  →  data/repository.ts  →  Supabase (RPC / Edge Function) / demo.ts
```

- **`src/types/domain.ts`** — SEMUA tipe domain. Nama tipe kode tetap pakai `Jamaah` dll. walaupun UI memakai istilah "Warga" (lihat §5 Terminologi).
- **`src/data/repository.ts`** — satu-satunya lapisan akses data. Setiap fungsi memeriksa `isDemoMode` dan memakai RPC Supabase untuk operasi yang perlu transaksi/validasi. Menjaga kompatibilitas dengan data lama yang belum punya tabel baru (kode error `42P01`/`PGRST205` diabaikan).
- **`src/contexts/DataContext.tsx`** — state utama seluruh aplikasi (`BootstrapData` dimuat sekali per login), plus semua operasi mutasi (`saveJamaah`, `saveAttendance`, dst.) yang memvalidasi aturan bisnis frontend lalu memanggil repository. Setelah mutasi, state diperbarui lokal + cache offline disimpan (`persistDemo`/`saveBootstrapCache`).
- **`src/contexts/AuthContext.tsx`** — sesi login, muat profil (`profiles`), flag `mustChangePassword`, realtime untuk profil/penugasan.
- **Mode demo vs Supabase** — diatur `src/lib/supabase.ts`: `VITE_DEMO_MODE=true` memakai `src/data/demo.ts` (data contoh + simpan ke localStorage) tanpa backend.

### Bootstrap data

Semua tabel inti dimuat sekaligus via `loadBootstrap(user)` dan direduksi menjadi `BootstrapData` (16+ koleksi). Fetch memakai pagination 500 baris (`fetchAllRows`). Data dipakai in-memory; Reload penuh terjadi saat: mount, kembali online, atau event Realtime.

### Pola penting yang harus dipertahankan

- **Selalu ada validasi aturan bisnis di frontend DAN di database (RPC/RLS).** Jangan hapus salah satu lapisan.
- **Snapshot historis**: laporan/rekap harus memakai `jamaahSnapshotAsOfDate` (rekonstruksi kelas/kategori/status aktif sesuai tanggal) — jangan pakai data terkini untuk laporan bulan lalu.
- **Optimistic locking absensi**: simpan selalu membawa `expectedRevision`; database menolak jika `revision` sudah berubah (error `ATTENDANCE_CONFLICT`).
- **Transaksi atomik via RPC**: `save_jamaah_record`, `save_attendance_session_complete`, `save_family_record`, `save_linked_guardian_contact`, `bulk_transition_jamaah_classes`, `change_jamaah_active_status`, `merge_jamaah_duplicates`, `save_meeting_note_record`, `bulk_import_jamaah`. Operasi mutasi baru yang multi-tabel **harus** jadi RPC security definer, bukan beberapa query dari client.
- **Baru-baru ini (`isDemoMode`)**: demo mode menjalankan logika merge/simpan di sisi client (`mergeDemoJamaah`, dsb.) — jika mengubah aturan merge/proses, ubah **dua-duanya** (RPC di `supabase/migrations/` + versi demo di `src/lib/`).
- **Kelas Pengajian Umum**: kelas `'Pengajian Umum'` (konstan `GENERAL_ATTENDANCE_CLASS_NAME` di `src/lib/generalAttendance.ts`) memicu pembuatan sesi rekap otomatis untuk Pra Remaja/Remaja/Pra Nikah hanya pada hari Senin & Rabu (`isGeneralAttendanceBreakdownDay`). Sesi otomatis bersifat read-only (`generatedFromSessionId`).

---

## 4. Struktur direktori

```text
src/
  components/       UI: AppLayout (sidebar/nav), Modal, Pagination, ProtectedRoute,
                    RoleRoute, PasswordReadyRoute, RichTextEditor, UI
  contexts/         AuthContext, DataContext (state global)
  data/             demo.ts (mode demo), repository.ts (akses Supabase)
  hooks/            useNetworkStatus, usePagination, usePwaInstall
  lib/              constants, utils, offline (cache+draft), pwa (service worker),
                    csvImport, contacts, followUps, generalAttendance, dataQuality,
                    mergeJamaah, monthlyReportPdf, meetingNotePdf
  pages/            satu file per halaman (lihat daftar route di §6)
  types/domain.ts   seluruh tipe data
public/             index.html (manifest, OG meta), sw.js, offline.html, icons
supabase/
  migrations/       001–020 (urut; setiap fitur punya migration baru)
  functions/        invite-admin, manage-admin (Edge Functions)
  config.toml       konfigurasi lokal Supabase
```

File akar penting: `vite.config.ts`, `vercel.json` (SPA rewrite), `.env.example`, `CHANGELOG.md` (riwayat fitur per versi), `SUPABASE_UPDATE.md` (catatan migration terbaru).

---

## 5. Terminologi (penting, jangan tertukar)

- Nama yang tampil ke pengguna: **Warga** (data), **Anggota Kelas** (konteks kelas), **Peserta** (konteks absensi/rekap sesi).
- Nama internal (tabel, tipe TS `Jamaah`, route, migration) **tetap `jamaah`** agar kompatibel dengan Supabase. **Jangan** mengganti istilah internal.
- Status absensi: `present`=Hadir, `excused`=Izin, `sick`=Sakit, `absent`=Alpa (default).
- Kategori sensus & daftar kelas: lihat `src/lib/constants.ts` (`CENSUS_CATEGORIES`, `CLASS_NAMES`, `CLASS_PROGRESSION`).
- Format tanggal internal: `YYYY-MM-DD` (`localIsoDate`). Tanggal lahir & tanggal efektif **tidak boleh** di masa depan.

---

## 6. Routing & peran (lihat `src/App.tsx`)

| Route | Halaman | Peran |
|---|---|---|
| `/login`, `/ganti-password` | Login, ganti password | publik / semua login |
| `/` | Dashboard | semua |
| `/jadwal`, `/absensi`, `/materi`, `/tindak-lanjut` | Jadwal, Absensi, Hasda & ASAD, Tindak Lanjut | Admin & Superadmin (Admin dibatasi kelas diampu) |
| `/keluarga-wali` | Keluarga & Wali | Admin (kelas diampu) & Superadmin |
| `/rekap`, `/laporan-bulanan` | Rekap, Laporan Bulanan | Admin (cakupan kelas) & Superadmin |
| `/notulensi`, `/notulensi/tindak-lanjut` | Notulensi, Tindak Lanjut Keputusan | semua |
| `/sensus`, `/kualitas-data`, `/kelas`, `/kenaikan-kelas`, `/arsip-jamaah`, `/pengaturan`, `/aktivitas` | Sensus, Kualitas Data, Kelas, Kenaikan & Mutasi, Status & Arsip, Pengaturan Admin, Riwayat Aktivitas | **Superadmin hanya** (`SuperadminRoute`) |

---

## 7. Backend Supabase

- **Migration**: `supabase/migrations/` dijalankan berurutan (001 → 020). Setiap fitur baru menambah migration baru (jangan edit migration lama setelah ter-deploy).
- **RLS**: setiap tabel inti punya Row Level Security; Admin dibatasi kelas yang diampu via relasi `admin_class_assignments`. RLS `select` biasanya terbuka untuk authenticated; **mutasi** diarahkan lewat fungsi security definer.
- **RPC utama** (lihat `src/data/repository.ts` untuk pasangan fungsi client):
  - `save_jamaah_record`, `bulk_import_jamaah`
  - `save_attendance_session_complete` (sesi + records + completions dalam satu transaksi, cek `revision`)
  - `save_family_record`, `save_linked_guardian_contact`
  - `bulk_transition_jamaah_classes`, `change_jamaah_active_status`
  - `merge_jamaah_duplicates`
  - `save_meeting_note_record`
  - `record_current_login`, `complete_password_change`
- **Edge Functions**: `invite-admin` (buat akun Admin), `manage-admin` (actions: `replace_assignments`, `set_active`, `reset_password`, `transfer_assignments`). Deploy dengan `supabase functions deploy <nama> --no-verify-jwt`.
- **Realtime**: semua tabel operasional masuk `supabase_realtime` publication (ditambahkan tiap migration).
- Setup: salin `.env.example` → `.env`, isi `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`, jalankan migration berurutan di Supabase SQL Editor.

---

## 8. Konvensi kode & checklist

- **Tidak ada komentar kode** kecuali diminta. Komentar logis singkat boleh di tempat krusial (sudah ada pola di codebase).
- Gaya: arrow function components, named export, import type terpisah, 2 spasi indent, trailing comma, tanpa semicolon opsional — ikuti pola file yang berdekatan.
- Semua teks UI dalam Bahasa Indonesia (label konsisten dengan `constants.ts`). Error user-facing berupa kalimat Indonesia yang jelas.
- Jangan menghapus lapisan validasi (frontend + RPC/RLS).
- **Setiap fitur baru yang menyentuh tabel** wajib: migration baru (`supabase/migrations/0NN_*.sql`), update `BootstrapData` + `loadBootstrap` + repository + DataContext + tipe, register Realtime, tambah ke `README.md` + `CHANGELOG.md`.
- Jangan menaruh secret di kode; `.env` hanya untuk var VITE_ publik (Supabase URL & publishable key).

---

## 9. Perintah umum

```bash
npm install
copy .env.example .env        # Windows
npm run dev                   # dev server (tanpa service worker)
npm run typecheck             # cek tipe
npm run build                 # typecheck + build ke dist/
npm run preview               # pratinjau build produksi (uji PWA/offline)
```

**Penting**: service worker hanya aktif pada build produksi (`npm run build` + `npm run preview` atau setelah deploy HTTPS). Setelah deploy, user perlu hard-refresh agar service worker baru aktif.

---

## 10. Batasan & kondisi saat ini

- Tidak ada automated test (unit/e2e) — verifikasi lewat `npm run typecheck` + `npm run build`.
- Backup JSON bisa diunduh tapi **restore belum tersedia**.
- Draft offline tersimpan lokal, tapi pengiriman final **butuh koneksi** (tidak ada antrean background).
- Periode yang ditutup mengunci perubahan operasional (jadwal, absensi, follow-up, materi, status, kelas) untuk bulan itu.
- Fitur "Penggabungan" di Kualitas Data: fase 11 hanya mendeteksi kandidat; merge penuh (fase 12) tersedia di menu Kualitas Data untuk Superadmin.
- `prototype-notulensi.html` adalah prototipe halaman notulensi (referensi visual), bukan bagian dari build.
