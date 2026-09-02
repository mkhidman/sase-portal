-- Admin dapat memperbaiki dan membatalkan jadwal untuk kelas yang diampunya.
-- Sebelumnya admin hanya boleh membuat jadwal (lihat 015), sehingga jadwal yang salah
-- tanggal atau salah kelas menjadi permanen dan terus muncul sebagai "belum diabsen".
-- Superadmin tetap dapat mengelola seluruh jadwal melalui policy yang sudah ada.

drop policy if exists "schedules updated within access" on public.schedules;
create policy "schedules updated within access"
on public.schedules for update to authenticated
using (public.can_manage_class(class_id))
with check (public.can_manage_class(class_id));

comment on policy "schedules updated within access" on public.schedules is
  'Admin hanya dapat mengubah jadwal kelas yang ditugaskan kepadanya, dan tidak dapat memindahkannya ke kelas lain; Superadmin dapat mengubah semua jadwal.';

drop policy if exists "schedules deleted within access" on public.schedules;
create policy "schedules deleted within access"
on public.schedules for delete to authenticated
using (public.can_manage_class(class_id));

comment on policy "schedules deleted within access" on public.schedules is
  'Admin hanya dapat membatalkan jadwal kelas yang ditugaskan kepadanya; Superadmin dapat membatalkan semua jadwal.';
