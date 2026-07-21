-- Fase 10: materi jadwal dinamis dan keterangan sesi.
-- Navigasi, pagination, threshold tindak lanjut, dan PDF berada di frontend.

alter table public.schedules
  add column if not exists material_name text not null default '';

alter table public.attendance_sessions
  add column if not exists material_name text not null default '',
  add column if not exists notes text;

-- Constraint lama hanya membedakan tipe materi. Materi kustom memakai tipe general,
-- sehingga nama materi harus ikut menjadi bagian dari identitas sesi.
alter table public.attendance_sessions
  drop constraint if exists attendance_sessions_date_class_id_material_type_key;

alter table public.attendance_sessions
  drop constraint if exists attendance_sessions_date_class_material_name_key;

alter table public.attendance_sessions
  add constraint attendance_sessions_date_class_material_name_key
  unique (date, class_id, material_type, material_name);

comment on column public.schedules.material_name is
  'Nama materi kustom. Kosong untuk materi bawaan seperti Hasda, ASAD, Materi Umum, dan Evaluasi.';

comment on column public.attendance_sessions.material_name is
  'Salinan nama materi dari jadwal agar rekap historis tidak berubah.';

comment on column public.attendance_sessions.notes is
  'Salinan keterangan jadwal pada saat absensi disimpan.';
