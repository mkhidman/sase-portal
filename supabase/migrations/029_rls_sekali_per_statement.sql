-- Policy baca dievaluasi sekali per statement, bukan sekali per baris.
--
-- Helper RLS yang ada (is_superadmin, can_manage_class, jamaah_in_managed_class,
-- jamaah_in_managed_attendance_history, family_in_managed_class) semuanya STABLE
-- tetapi berparameter, jadi Postgres memanggilnya untuk SETIAP baris: satu baris
-- attendance_records memicu satu subquery ke attendance_sessions plus satu lookup
-- ke profiles. Pada bootstrap yang menarik seluruh tabel, biayanya jumlah baris
-- dikali kedalaman helper -- inilah bagian terlambat saat aplikasi pertama dibuka.
--
-- Bentuk di bawah memakai subquery tanpa acuan ke baris luar, sehingga
-- direncanakan sebagai InitPlan: dihitung sekali, lalu dipakai sebagai hash.
-- Aturan aksesnya TIDAK berubah; tiap policy di sini setara logis dengan
-- pendahulunya. Helper lamanya dibiarkan hidup karena masih dipakai policy
-- tulis dan beberapa RPC.

create or replace function public.managed_class_ids()
returns uuid[]
language sql
stable
security definer set search_path = public
as $$
  select coalesce(array_agg(class_id), '{}'::uuid[])
  from public.admin_class_assignments
  where admin_id = auth.uid();
$$;

grant execute on function public.managed_class_ids() to authenticated;

-- schedules: can_manage_class(class_id)
drop policy if exists "schedules read within access" on public.schedules;
create policy "schedules read within access" on public.schedules for select to authenticated
using (
  (select public.is_superadmin())
  or class_id in (select unnest(public.managed_class_ids()))
);

-- attendance_sessions: can_manage_class(class_id)
drop policy if exists "attendance sessions within access" on public.attendance_sessions;
create policy "attendance sessions within access" on public.attendance_sessions for select to authenticated
using (
  (select public.is_superadmin())
  or class_id in (select unnest(public.managed_class_ids()))
);

-- attendance_records: exists(session dengan can_manage_class). session_id punya
-- foreign key ke attendance_sessions, jadi sesinya selalu ada dan exists-nya
-- cukup diganti keanggotaan himpunan.
drop policy if exists "attendance records within access" on public.attendance_records;
create policy "attendance records within access" on public.attendance_records for select to authenticated
using (
  (select public.is_superadmin())
  or session_id in (
    select s.id from public.attendance_sessions s
    where s.class_id in (select unnest(public.managed_class_ids()))
  )
);

-- jamaah_classes: is_superadmin() or can_manage_class(class_id)
drop policy if exists "jamaah classes read within access" on public.jamaah_classes;
create policy "jamaah classes read within access" on public.jamaah_classes for select to authenticated
using (
  (select public.is_superadmin())
  or class_id in (select unnest(public.managed_class_ids()))
);

-- jamaah: is_superadmin() or jamaah_in_managed_class(id) or jamaah_in_managed_attendance_history(id).
-- Ketiga cabang helper itu dijabarkan: kelas saat ini, kelas pada riwayat
-- kenaikan, dan kelas tempat warga pernah diabsen.
drop policy if exists "jamaah read within access" on public.jamaah;
create policy "jamaah read within access" on public.jamaah for select to authenticated
using (
  (select public.is_superadmin())
  or id in (
    select jc.jamaah_id from public.jamaah_classes jc
    where jc.class_id in (select unnest(public.managed_class_ids()))
  )
  or id in (
    select h.jamaah_id from public.class_membership_history h
    where h.from_class_id in (select unnest(public.managed_class_ids()))
       or h.to_class_id in (select unnest(public.managed_class_ids()))
  )
  or id in (
    select ar.jamaah_id from public.attendance_records ar
    join public.attendance_sessions s on s.id = ar.session_id
    where s.class_id in (select unnest(public.managed_class_ids()))
  )
);

-- material_completions: is_superadmin() or (class_id not null and can_manage_class(class_id)) or jamaah_in_managed_class(jamaah_id)
drop policy if exists "material completion read within access" on public.material_completions;
create policy "material completion read within access" on public.material_completions for select to authenticated
using (
  (select public.is_superadmin())
  or class_id in (select unnest(public.managed_class_ids()))
  or jamaah_id in (
    select jc.jamaah_id from public.jamaah_classes jc
    where jc.class_id in (select unnest(public.managed_class_ids()))
  )
  or jamaah_id in (
    select h.jamaah_id from public.class_membership_history h
    where h.from_class_id in (select unnest(public.managed_class_ids()))
       or h.to_class_id in (select unnest(public.managed_class_ids()))
  )
);

-- class_membership_history
drop policy if exists "class history readable within access" on public.class_membership_history;
create policy "class history readable within access" on public.class_membership_history for select to authenticated
using (
  (select public.is_superadmin())
  or from_class_id in (select unnest(public.managed_class_ids()))
  or to_class_id in (select unnest(public.managed_class_ids()))
);

-- jamaah_status_history: exists(assignment dengan class_id = any(class_ids)) == irisan dua array
drop policy if exists "status history readable within access" on public.jamaah_status_history;
create policy "status history readable within access" on public.jamaah_status_history for select to authenticated
using (
  (select public.is_superadmin())
  or class_ids && (select public.managed_class_ids())
);

-- families: family_in_managed_class(id)
drop policy if exists "families read within access" on public.families;
create policy "families read within access" on public.families for select to authenticated
using (
  (select public.is_superadmin())
  or id in (
    select m.family_id from public.family_members m
    where m.jamaah_id in (
      select jc.jamaah_id from public.jamaah_classes jc
      where jc.class_id in (select unnest(public.managed_class_ids()))
    )
    or m.jamaah_id in (
      select h.jamaah_id from public.class_membership_history h
      where h.from_class_id in (select unnest(public.managed_class_ids()))
         or h.to_class_id in (select unnest(public.managed_class_ids()))
    )
  )
);

-- family_members: is_superadmin() or jamaah_in_managed_class(jamaah_id)
drop policy if exists "family members read within access" on public.family_members;
create policy "family members read within access" on public.family_members for select to authenticated
using (
  (select public.is_superadmin())
  or jamaah_id in (
    select jc.jamaah_id from public.jamaah_classes jc
    where jc.class_id in (select unnest(public.managed_class_ids()))
  )
  or jamaah_id in (
    select h.jamaah_id from public.class_membership_history h
    where h.from_class_id in (select unnest(public.managed_class_ids()))
       or h.to_class_id in (select unnest(public.managed_class_ids()))
  )
);

-- guardian_contacts: is_superadmin() or jamaah_in_managed_class(jamaah_id)
drop policy if exists "guardian contacts read within access" on public.guardian_contacts;
create policy "guardian contacts read within access" on public.guardian_contacts for select to authenticated
using (
  (select public.is_superadmin())
  or jamaah_id in (
    select jc.jamaah_id from public.jamaah_classes jc
    where jc.class_id in (select unnest(public.managed_class_ids()))
  )
  or jamaah_id in (
    select h.jamaah_id from public.class_membership_history h
    where h.from_class_id in (select unnest(public.managed_class_ids()))
       or h.to_class_id in (select unnest(public.managed_class_ids()))
  )
);

-- jamaah_follow_ups: can_manage_class(class_id) AND jamaah_in_managed_class(jamaah_id)
drop policy if exists "follow ups read within access" on public.jamaah_follow_ups;
create policy "follow ups read within access" on public.jamaah_follow_ups for select to authenticated
using (
  (select public.is_superadmin())
  or (
    class_id in (select unnest(public.managed_class_ids()))
    and (
      jamaah_id in (
        select jc.jamaah_id from public.jamaah_classes jc
        where jc.class_id in (select unnest(public.managed_class_ids()))
      )
      or jamaah_id in (
        select h.jamaah_id from public.class_membership_history h
        where h.from_class_id in (select unnest(public.managed_class_ids()))
           or h.to_class_id in (select unnest(public.managed_class_ids()))
      )
    )
  )
);

-- Tabel khusus Superadmin: biaya per barisnya hanya lookup profiles, tetapi
-- merge_history dan audit_logs ikut bootstrap dan tumbuh terus.
drop policy if exists "merge history managed by superadmin" on public.jamaah_merge_history;
create policy "merge history managed by superadmin" on public.jamaah_merge_history for select to authenticated
using ((select public.is_superadmin()));

drop policy if exists "wali access read by superadmin" on public.wali_access;
create policy "wali access read by superadmin" on public.wali_access for select to authenticated
using ((select public.is_superadmin()));

drop policy if exists "superadmin reads audit logs" on public.audit_logs;
create policy "superadmin reads audit logs" on public.audit_logs for select to authenticated
using ((select public.is_superadmin()));

-- attendance_records tidak punya indeks pada jamaah_id sendiri (primary key-nya
-- (session_id, jamaah_id)), padahal policy jamaah memindainya untuk mengumpulkan
-- warga yang pernah diabsen.
create index if not exists attendance_records_jamaah_idx on public.attendance_records(jamaah_id);
