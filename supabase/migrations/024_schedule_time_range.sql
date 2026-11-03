-- Jam mulai dan jam selesai pengajian.
-- Keduanya boleh kosong: ribuan jadwal lama dibuat tanpa jam, dan memaksa nilai
-- (misalnya default '00:00') akan menampilkan jam palsu pada jadwal yang memang
-- tidak pernah punya jam.

alter table public.schedules
  add column if not exists start_time time,
  add column if not exists end_time time;

comment on column public.schedules.start_time is 'Jam mulai pengajian. NULL berarti jadwal dibuat tanpa jam.';
comment on column public.schedules.end_time is 'Jam selesai pengajian. NULL berarti jadwal dibuat tanpa jam.';

-- Pasangan kembar validasi di DataContext.saveSchedule. Sengaja permisif: hanya
-- satu dari dua jam boleh diisi (jam mulai saja itu wajar), yang dilarang adalah
-- jam selesai mendahului jam mulai.
alter table public.schedules drop constraint if exists schedules_time_range_valid;
alter table public.schedules
  add constraint schedules_time_range_valid
  check (start_time is null or end_time is null or end_time > start_time);
