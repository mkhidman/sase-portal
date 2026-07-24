-- Admin dapat menambahkan jadwal hanya untuk kelas yang diampunya.
-- Superadmin tetap dapat mengelola seluruh jadwal melalui policy yang sudah ada.

drop policy if exists "schedules inserted within access" on public.schedules;
create policy "schedules inserted within access"
on public.schedules for insert to authenticated
with check (public.can_manage_class(class_id));

comment on policy "schedules inserted within access" on public.schedules is
  'Admin hanya dapat membuat jadwal untuk kelas yang ditugaskan kepadanya; Superadmin dapat membuat untuk semua kelas.';
