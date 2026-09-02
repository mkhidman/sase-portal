-- Menghapus modul Notulensi Musyawarah yang tidak jadi dipakai.
--
-- PERINGATAN: migration ini menghapus data secara permanen. Seluruh isi tabel
-- meeting_notes, meeting_note_participants, dan meeting_note_actions akan hilang
-- dan tidak tercakup oleh fitur backup JSON aplikasi. Ekspor terlebih dahulu bila
-- isinya masih dibutuhkan.
--
-- Migration 020_meeting_notes.sql sengaja dipertahankan di repositori sebagai
-- riwayat: instalasi baru tetap menjalankan 020 lalu dibatalkan oleh 022 ini.

-- Fungsi dilepas sebelum tipenya, karena tanda tangannya memakai meeting_note_status.
-- Bentuk tanpa daftar argumen dipakai agar migration tetap aman dijalankan berulang
-- meski tipe pendukungnya sudah tidak ada.
drop function if exists public.save_meeting_note_record;

-- Menghapus tabel sekaligus melepaskannya dari publication supabase_realtime dan
-- membuang policy, index, serta trigger miliknya. Urutan mengikuti arah foreign key.
-- Fungsi set_updated_at tidak ikut dihapus karena dipakai tabel lain.
drop table if exists public.meeting_note_actions;
drop table if exists public.meeting_note_participants;
drop table if exists public.meeting_notes;

drop type if exists public.meeting_action_status;
drop type if exists public.meeting_note_status;
