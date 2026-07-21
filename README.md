# Sensus Jamaah

Fase 12 development aplikasi sensus, kelas pengajian, absensi, ketuntasan Hasda/ASAD, rekap, dan penggabungan data duplikat.

## Fitur utama

- Login Superadmin dan Admin/Wali Kelas menggunakan Supabase Auth.
- Satu Admin dapat mengampu beberapa kelas dengan pembatasan Row Level Security.
- Data sensus dengan tanggal lahir opsional dan import massal CSV.
- Satu jamaah dapat mengikuti banyak kelas pengajian.
- Jadwal pengajian terhubung langsung ke absensi.
- Absensi default Alpa dan Pengajian Umum dikelompokkan berdasarkan kategori sensus.
- Target Hasda dan ASAD per bulan beserta penyusulan mandiri.
- Rekap seluruh sesi, persentase kehadiran, detail, edit, hapus, dan ekspor CSV.
- Pengelolaan akun Admin dan penugasan kelas.
- Sinkronisasi realtime antarperangkat.

## Fase 4: kesiapan operasional

- Progressive Web App yang dapat dipasang di layar utama smartphone.
- Service worker dan app shell untuk membuka aplikasi yang sudah pernah dimuat ketika offline.
- Cache data terakhir dipisahkan per akun pengguna.
- Indikator koneksi dan waktu sinkronisasi terakhir.
- Draft absensi tersimpan otomatis di perangkat dan dipulihkan ketika halaman dibuka kembali.
- Pengiriman final absensi tetap membutuhkan koneksi agar data masuk ke Supabase.
- Backup lengkap dalam format JSON melalui Pengaturan Admin.
- Riwayat aktivitas untuk perubahan jamaah, jadwal, sesi absensi, ketuntasan materi, dan penugasan Admin.
- Konfigurasi SPA redirect untuk Cloudflare Pages/Netlify melalui `public/_redirects`.

## Fase 5: pemantauan kehadiran dan tindak lanjut

- Deteksi jamaah dengan persentase hadir di bawah 70%, Alpa dua kali, atau Alpa berturut-turut.
- Prioritas otomatis untuk kehadiran di bawah 50% atau Alpa tiga sesi berturut-turut.
- Catatan tindak lanjut per jamaah, kelas, dan bulan.
- Status: belum ditindaklanjuti, sudah dihubungi, perlu kunjungan, dan selesai.
- Tanggal tindak lanjut berikutnya dan indikator jatuh tempo.
- Tombol WhatsApp bagi jamaah yang memiliki nomor telepon.
- Ringkasan jamaah perlu perhatian pada Dashboard.

## Fase 6: laporan bulanan dan tutup periode

- Laporan evaluasi per kelas dan per bulan.
- Ringkasan sesi, kehadiran, Hasda, ASAD, dan tindak lanjut terbuka.
- Ekspor ringkasan kelas dan detail per jamaah ke CSV.
- Checklist kesiapan sebelum periode ditutup.
- Superadmin dapat menutup atau membuka kembali periode.
- Periode tertutup dikunci pada aplikasi dan database.


## Fase 7: kenaikan kelas dan histori keanggotaan

- Kenaikan atau mutasi banyak jamaah sekaligus.
- Rekomendasi alur Playgroup sampai Pra Nikah.
- Kelas tambahan seperti Pengajian Umum, Pengajian Ibu-Ibu, Usia Istimewa, dan 5 Unsur tetap dipertahankan.
- Kategori sensus dapat disesuaikan otomatis berdasarkan kelas tujuan.
- Setiap perubahan menyimpan tanggal efektif, jenis perubahan, catatan, dan pengguna yang memproses.
- Riwayat dapat dicari, difilter, dan diekspor ke CSV.
- Laporan bulanan merekonstruksi keanggotaan kelas sesuai akhir bulan agar kenaikan kelas tidak mengubah laporan lama.


## Fase 8: status aktif dan arsip jamaah

- Jamaah dapat dipindahkan ke arsip tanpa menghapus data absensi, ketuntasan materi, atau laporan lama.
- Alasan nonaktif mencakup pindah domisili, berhenti mengikuti pengajian, selesai pembinaan, meninggal dunia, data ganda, dan lainnya.
- Kelas aktif dilepas saat jamaah diarsipkan agar tidak muncul pada absensi baru.
- Jamaah dapat diaktifkan kembali sekaligus dipilihkan kelas yang akan diikuti.
- Setiap perubahan menyimpan tanggal efektif, alasan, catatan, kelas terkait, dan pengguna yang memproses.
- Laporan bulanan merekonstruksi status aktif serta keanggotaan pada akhir bulan, sehingga pengarsipan baru tidak mengubah laporan lama.
- Perubahan status langsung dari form sensus dibatasi; seluruh perubahan harus melalui menu Status & Arsip.


## Fase 9: data keluarga dan kontak wali

- Mengelompokkan beberapa jamaah dalam satu data keluarga tanpa menggandakan data sensus.
- Menyimpan nama keluarga, alamat, catatan, hubungan anggota, dan kontak keluarga utama.
- Menyimpan beberapa kontak wali untuk setiap jamaah dengan satu kontak utama.
- Admin dapat melihat keluarga dan kontak wali hanya untuk jamaah dari kelas yang diampunya.
- Superadmin dapat menambah, mengubah, dan menghapus keluarga serta kontak wali.
- Tombol WhatsApp pada Tindak Lanjut otomatis memakai nomor wali utama ketika nomor jamaah kosong.
- Data keluarga dan wali ikut masuk backup JSON, cache offline, Realtime, dan Riwayat Aktivitas.


## Fase 10: navigasi, pagination, materi, dan PDF

- Sidebar dikelompokkan menjadi subnavigasi agar lebih ringkas.
- Pagination 10/15 baris pada tabel data utama.
- Materi jadwal dapat ditambah secara dinamis beserta keterangan.
- Ambang Tindak Lanjut menggunakan minimal 4 kali Alpa.
- Laporan Bulanan dapat diunduh sebagai PDF rapi.
- Ringkasan kategori sensus per jenis kelamin tersedia pada Data Sensus dan PDF bulanan.


## Fase 12: penggabungan data duplikat

Menu **Data Jamaah → Kualitas Data** sekarang dapat menggabungkan dua data yang terdeteksi mirip. Superadmin memilih data utama, memeriksa profil akhir, lalu sistem memindahkan kelas, absensi, ketuntasan materi, tindak lanjut, kontak wali, serta histori dalam satu transaksi.

Aturan konflik utama:

- Absensi pada sesi yang sama mempertahankan status terbaik: Hadir → Sakit → Izin → Alpa.
- Kelas dari kedua data digabung tanpa duplikasi.
- Ketuntasan Hasda/ASAD pada bulan yang sama digabung satu kali.
- Tindak lanjut yang belum selesai tidak tertimpa status selesai.
- Jika kedua data berada di keluarga berbeda, keluarga data utama dipertahankan dan konflik dicatat.
- Snapshot lengkap data yang dihapus disimpan pada Riwayat Penggabungan.

## Fase 11: pilot dan hardening

- Halaman Kualitas Data untuk menemukan jamaah aktif tanpa kelas, kontak kosong, wali anak belum diisi, tanggal lahir kosong, ketidaksesuaian kategori/kelas, dan rekomendasi Pengajian Usia Istimewa.
- Deteksi kandidat data duplikat dari nama, tanggal lahir, dan nomor WhatsApp tanpa menggabungkan data secara otomatis.
- Dashboard Superadmin menampilkan indikator kelengkapan data.
- Absensi memakai nomor revisi agar dua Admin tidak saling menimpa sesi yang sama.
- Penyimpanan sesi dan seluruh status jamaah dilakukan dalam satu transaksi database.
- Draft absensi langsung diamankan saat tab disembunyikan, halaman ditutup, atau filter sesi diganti.
- Tombol simpan sticky pada smartphone dan peringatan ketika ada perubahan dari perangkat lain.
- Jamaah yang sudah pindah kelas atau diarsipkan tetap dipertahankan saat sesi historis diedit.

## Menjalankan project

```bash
npm install
cp .env.example .env
npm run dev
```

Untuk Windows Command Prompt:

```bat
copy .env.example .env
```

Project menyertakan `.npmrc` yang mengarah ke registry publik:

```text
https://registry.npmjs.org/
```

## Menghubungkan Supabase

Pastikan `.env` berisi:

```env
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Jalankan migration secara berurutan:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_enable_realtime.sql`
3. `supabase/migrations/003_bulk_import_jamaah.sql`
4. `supabase/migrations/004_optional_birth_date.sql`
5. `supabase/migrations/005_operational_reliability.sql`
6. `supabase/migrations/006_attendance_follow_up.sql`
7. `supabase/migrations/007_monthly_reporting.sql`
8. `supabase/migrations/008_class_progression.sql`
9. `supabase/migrations/009_jamaah_lifecycle.sql`
10. `supabase/migrations/010_family_guardian_contacts.sql`
11. `supabase/migrations/011_navigation_pagination_material_pdf.sql`
12. `supabase/migrations/012_pilot_hardening.sql`
13. `supabase/migrations/013_duplicate_merge.sql`

Untuk project yang sudah menjalankan migration 001–012, cukup jalankan migration 013.

Migration 013 wajib untuk menjalankan penggabungan data duplikat dan menyimpan riwayat merge. Migration 012 tetap diperlukan untuk perlindungan konflik edit absensi.

## Edge Function pembuatan Admin

```bash
supabase functions deploy invite-admin --no-verify-jwt
```

Function tetap memeriksa access token dan role Superadmin di dalam function.

## Build produksi

```bash
npm run typecheck
npm run build
npm run preview
```

Folder hasil build berada di `dist/`.

## Catatan PWA dan offline

- Service worker hanya didaftarkan pada production build, bukan saat `npm run dev`.
- Uji instalasi PWA melalui `npm run build` lalu `npm run preview`, atau setelah deploy melalui HTTPS.
- Data terakhir dapat dibaca saat offline setelah aplikasi pernah berhasil dimuat oleh akun tersebut.
- Draft absensi disimpan lokal, tetapi tombol Simpan Absensi membutuhkan koneksi untuk mengirim ke Supabase.
- Cache lokal menggunakan kunci berbeda untuk setiap user agar data Superadmin tidak tampil pada akun Admin di perangkat yang sama.

## Struktur penting

```text
src/
  components/      layout dan komponen UI
  contexts/        autentikasi dan state data
  data/            demo store dan repository Supabase
  hooks/           status koneksi dan instalasi PWA
  lib/             utility, cache offline, PWA, Supabase client
  pages/           halaman aplikasi
  types/           domain TypeScript
public/
  manifest.webmanifest
  sw.js
  offline.html
supabase/
  migrations/
  functions/
```

## Batas fase saat ini

- Draft offline belum dikirim otomatis sebagai antrean background; pengguna menekan Simpan setelah koneksi kembali.
- Backup JSON dapat diunduh, tetapi restore otomatis belum tersedia.
- Perubahan kelas sebelum migration 008 dijalankan tidak memiliki histori otomatis dan tidak dapat direkonstruksi.
- Status nonaktif yang dibuat sebelum migration 009 tidak memiliki alasan, tanggal efektif, atau kelas terakhir otomatis.
- Data keluarga dan kontak wali baru tersedia setelah migration 010; data lama perlu dilengkapi secara bertahap.
- Materi kustom dan keterangan sesi baru tersimpan di Supabase setelah migration 011.
- PDF Laporan Bulanan dibuat langsung di browser; tabel yang sangat besar dapat menghasilkan beberapa halaman.
- Penggabungan kandidat duplikat belum tersedia; fase 11 hanya mendeteksi dan membandingkan agar histori tidak terhapus secara keliru.
- Belum ada automated end-to-end test dan deployment produksi karena membutuhkan akun hosting pengguna.

## Fase 13 — Manajemen Akun Admin

Setelah migration 001–013 aktif, jalankan `supabase/migrations/014_admin_account_management.sql`, lalu deploy Edge Function `invite-admin` dan `manage-admin`.

Fitur fase ini mencakup status aktif/nonaktif Admin, login terakhir, reset password sementara, kewajiban ganti password, pemindahan penugasan kelas, dan perlindungan agar kelas tidak kehilangan wali.
