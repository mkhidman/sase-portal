## Belum dirilis

- Menambahkan filter Laki-laki/Perempuan pada pengisian absensi dan membuat aksi massal mengikuti gender yang dipilih.
- Menambahkan kolom materi sambung/keterangan langsung pada formulir absensi.
- Mengizinkan Admin membuat jadwal hanya untuk kelas yang diampunya melalui validasi frontend dan RLS.
- Melengkapi daftar warga pada halaman Keluarga & Wali dengan gender, kategori sensus, kelas, tanggal lahir, usia, dan nomor pribadi.
- Memperjelas bahwa komposisi sensus pada Laporan Bulanan Admin hanya mencakup kelas yang diampu.
- Menambahkan migration `015_admin_schedule_creation.sql`.

## 0.13.2

- Mengganti istilah antarmuka utama dari “Jamaah” menjadi “Warga”, “Anggota Kelas”, atau “Peserta” sesuai konteks.
- Mengubah identitas aplikasi yang tampil ke pengguna menjadi SASE Portal.
- Menambahkan metadata Open Graph dan Twitter Card untuk pratinjau WhatsApp/media sosial.
- Menambahkan gambar berbagi sosial khusus berukuran 1200×630.
- Nama tabel, tipe data, route, dan migration Supabase tetap dipertahankan agar kompatibilitas database tidak berubah.

## 0.13.1

- Menambahkan ringkasan ketuntasan Hasda dan ASAD per jenis kelamin.
- Menampilkan jumlah Laki-laki dan Perempuan yang tuntas dibanding total peserta.
- Menambahkan ringkasan yang sama ke Laporan Bulanan dan PDF.
- Tidak memerlukan migration Supabase baru.

## 0.13.0

- Menambahkan status aktif/nonaktif akun Admin dan pengamanan akses pada RLS.
- Menambahkan reset password sementara serta kewajiban ganti password saat login berikutnya.
- Menambahkan halaman ganti password sebelum Admin dapat membuka aplikasi.
- Menampilkan waktu login terakhir Admin.
- Menambahkan pemindahan penugasan kelas antar-Admin.
- Mencegah kelas kehilangan wali saat Admin dinonaktifkan.
- Menambahkan migration `014_admin_account_management.sql` dan Edge Function `manage-admin`.

# Changelog

## 0.12.0

- Menambahkan penggabungan data jamaah duplikat secara transaksional.
- Memindahkan kelas, absensi, ketuntasan materi, tindak lanjut, kontak wali, dan seluruh histori ke data utama.
- Menambahkan pemilihan data utama serta penyuntingan profil akhir sebelum merge.
- Menambahkan penyelesaian konflik absensi dan keluarga yang aman.
- Menyimpan snapshot data lama dan riwayat penggabungan.
- Menambahkan migration `013_duplicate_merge.sql`.

## 0.11.0

- Menambahkan halaman Kualitas Data dan indikator kelengkapan pada Dashboard Superadmin.
- Mendeteksi jamaah tanpa kelas, tanpa kontak, anak tanpa wali, tanggal lahir kosong, kategori/kelas tidak selaras, nomor pendek, dan usia 55+ yang belum masuk Pengajian Usia Istimewa.
- Menambahkan deteksi serta perbandingan kandidat duplikat tanpa penggabungan otomatis.
- Menambahkan optimistic locking pada absensi menggunakan kolom `revision`.
- Memindahkan penyimpanan sesi dan record absensi ke RPC transaksional agar tidak tersimpan setengah jalan.
- Menambahkan peringatan konflik ketika sesi diperbarui dari perangkat lain.
- Memperkuat draft absensi saat tab disembunyikan, halaman ditutup, atau filter sesi diganti.
- Menambahkan tombol simpan sticky untuk penggunaan smartphone.
- Mempertahankan peserta historis ketika sesi lama diedit setelah jamaah pindah kelas atau diarsipkan.
- Menambahkan migration `012_pilot_hardening.sql`.

## 0.10.1

- Menambahkan ringkasan jumlah Laki-laki dan Perempuan untuk setiap kategori sensus pada halaman Data Sensus.
- Menambahkan ekspor CSV khusus ringkasan kategori sensus.
- Menambahkan komposisi sensus historis per jenis kelamin pada Laporan Bulanan.
- Menambahkan tabel komposisi sensus per jenis kelamin ke output PDF bulanan.
- Tidak membutuhkan migration Supabase baru karena seluruh angka dihitung dari data jamaah yang sudah tersedia.

## 0.10.0

- Mengelompokkan sidebar menjadi subnavigasi Data Jamaah, Pengajian, Pemantauan, Laporan, dan Sistem agar navigasi lebih ringkas.
- Menambahkan pagination 10 atau 15 baris pada tabel Data Sensus, Status & Arsip, Kontak Wali, Kenaikan & Mutasi, Pengaturan Admin, Laporan Bulanan, serta daftar sesi Rekap.
- Menambahkan materi jadwal dinamis yang dapat dibuat sendiri dan digunakan kembali pada jadwal berikutnya.
- Menambahkan keterangan jadwal dan menyimpan salinannya pada sesi absensi untuk menjaga rekap historis.
- Merapikan filter dan select pada halaman Tindak Lanjut serta mengubah ambang tinjauan menjadi minimal 4 kali Alpa per bulan.
- Mengganti ekspor CSV Laporan Bulanan dengan dokumen PDF A4 landscape yang berisi ringkasan, kesiapan periode, performa kelas, dan detail jamaah.
- Menambahkan migration `011_navigation_pagination_material_pdf.sql`.

## 0.9.0

- Menambahkan halaman Keluarga & Kontak Wali untuk Superadmin dan Admin.
- Menambahkan pengelompokan jamaah dalam keluarga beserta hubungan anggota.
- Menambahkan beberapa kontak wali per jamaah dan penentuan kontak utama.
- Menggunakan kontak wali utama pada tombol WhatsApp Tindak Lanjut ketika nomor jamaah kosong.
- Menambahkan RLS agar Admin hanya membaca keluarga/wali dari kelas yang diampu.
- Menambahkan transaksi RPC, Realtime, audit, backup, dan migration `010_family_guardian_contacts.sql`.

## 0.8.0

- Menambahkan halaman Status & Arsip Jamaah untuk Superadmin.
- Menambahkan alur nonaktif tanpa menghapus absensi dan laporan lama.
- Menambahkan alasan, tanggal efektif, catatan, serta kelas terakhir pada perubahan status.
- Menambahkan reaktivasi jamaah dan pemilihan ulang kelas.
- Menambahkan riwayat status, pencarian, filter, dan ekspor CSV.
- Memperbaiki laporan bulanan agar merekonstruksi status aktif di akhir bulan.
- Menambahkan migration `009_jamaah_lifecycle.sql` dan pengamanan agar status tidak diubah langsung tanpa histori.

## 0.7.0

- Menambahkan halaman Kenaikan & Mutasi Kelas untuk Superadmin.
- Menambahkan pemindahan massal jamaah dengan tanggal efektif dan catatan.
- Menambahkan penyesuaian otomatis kategori sensus berdasarkan kelas tujuan.
- Menambahkan histori keanggotaan kelas dan ekspor CSV.
- Mempertahankan kelas tambahan ketika jamaah naik atau pindah kelas.
- Memperbaiki Laporan Bulanan agar memakai keanggotaan sesuai akhir bulan.
- Menambahkan migration `008_class_progression.sql`.

## 0.6.0

- Menambahkan halaman Laporan Bulanan untuk evaluasi per kelas.
- Menambahkan ekspor ringkasan kelas dan detail jamaah.
- Menambahkan checklist kesiapan tutup periode.
- Menambahkan status periode terbuka/ditutup dan penguncian perubahan operasional.
- Menambahkan tabel `reporting_periods` serta migration `007_monthly_reporting.sql`.


## 0.5.0

- Menambahkan halaman Pemantauan & Tindak Lanjut.
- Menambahkan deteksi otomatis kehadiran rendah dan Alpa berulang per kelas/bulan.
- Menambahkan status tindak lanjut, catatan, tanggal berikutnya, dan tautan WhatsApp.
- Menambahkan ringkasan jamaah perlu perhatian pada Dashboard.
- Menambahkan tabel `jamaah_follow_ups`, RLS, Realtime, serta migration `006_attendance_follow_up.sql`.


## 0.4.0

- Menambahkan Progressive Web App, manifest, icon, service worker, dan offline fallback.
- Menambahkan cache data terakhir per akun pengguna untuk akses baca ketika koneksi terputus.
- Menambahkan indikator online/offline dan waktu sinkronisasi terakhir.
- Menambahkan auto-save serta pemulihan draft absensi pada perangkat.
- Menambahkan backup data lengkap dalam format JSON.
- Menambahkan tabel dan halaman Riwayat Aktivitas untuk Superadmin.
- Menambahkan migration `005_operational_reliability.sql`.
- Menambahkan konfigurasi SPA redirect untuk hosting static.

## 0.3.1

- Menjadikan tanggal lahir jamaah opsional pada form tambah/edit sensus.
- Menampilkan “Belum diisi” pada usia ketika tanggal lahir kosong.
- Mengirim tanggal lahir kosong sebagai `NULL` ke Supabase.
- Mengizinkan tanggal lahir kosong pada import CSV.
- Menambahkan migration `004_optional_birth_date.sql`.

## 0.3.0

- Merapikan modal Tambah Admin/Wali Kelas.
- Menambahkan import massal data sensus dari CSV.
- Menambahkan migration `003_bulk_import_jamaah.sql`.

## 0.1.2

- Menambahkan persentase kehadiran pada detail dan ekspor rekap sesi.

## 0.1.1

- Menghapus seluruh referensi registry internal dari `package-lock.json`.
- Menambahkan `.npmrc` untuk registry publik npm.
