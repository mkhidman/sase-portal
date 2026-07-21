-- Fase 13: manajemen akun Admin, password awal, login terakhir, dan pemindahan penugasan.
-- Jalankan setelah migration 013_duplicate_merge.sql.

alter table public.profiles
  add column if not exists active boolean not null default true,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists last_login_at timestamptz;

-- Akun yang sudah ada tidak dipaksa mengganti password. Akun Admin baru akan memakai default true melalui trigger.
alter table public.profiles alter column must_change_password set default true;

create index if not exists profiles_role_active_idx on public.profiles(role, active);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  assigned_role public.app_role;
begin
  assigned_role := coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'admin');
  insert into public.profiles (id, full_name, email, role, active, must_change_password)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, ''),
    assigned_role,
    true,
    case
      when new.raw_user_meta_data ? 'must_change_password'
        then coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, assigned_role = 'admin')
      else assigned_role = 'admin'
    end
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role;
  return new;
end;
$$;

create or replace function public.is_account_active(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = target_user_id and active = true
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin' and active = true
  );
$$;

create or replace function public.can_manage_class(target_class_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_account_active(auth.uid()) and (
    public.is_superadmin() or exists (
      select 1 from public.admin_class_assignments
      where admin_id = auth.uid() and class_id = target_class_id
    )
  );
$$;

create or replace function public.jamaah_in_managed_class(target_jamaah_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_account_active(auth.uid()) and (
    public.is_superadmin() or exists (
      select 1
      from public.jamaah_classes jc
      join public.admin_class_assignments aca on aca.class_id = jc.class_id
      where jc.jamaah_id = target_jamaah_id and aca.admin_id = auth.uid()
    )
  );
$$;

grant execute on function public.is_account_active(uuid) to authenticated;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.can_manage_class(uuid) to authenticated;
grant execute on function public.jamaah_in_managed_class(uuid) to authenticated;

-- Kebijakan baca umum tetap mensyaratkan akun aktif.
drop policy if exists "classes readable" on public.study_classes;
create policy "classes readable" on public.study_classes for select to authenticated
using (public.is_account_active(auth.uid()));

drop policy if exists "reporting periods readable" on public.reporting_periods;
create policy "reporting periods readable" on public.reporting_periods for select to authenticated
using (public.is_account_active(auth.uid()));


create or replace function public.record_current_login()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  recorded_at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak valid.';
  end if;
  update public.profiles
  set last_login_at = recorded_at
  where id = auth.uid() and active = true;
  if not found then
    raise exception 'Akun tidak aktif.';
  end if;
  return recorded_at;
end;
$$;

grant execute on function public.record_current_login() to authenticated;

create or replace function public.complete_password_change()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_account_active(auth.uid()) then
    raise exception 'Akun tidak aktif atau sesi tidak valid.';
  end if;
  update public.profiles
  set must_change_password = false
  where id = auth.uid();
  return true;
end;
$$;

grant execute on function public.complete_password_change() to authenticated;

create or replace function public.assert_active_superadmin(requesting_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = requesting_user_id and role = 'superadmin' and active = true
  ) then
    raise exception 'Hanya Superadmin aktif yang dapat mengelola akun Admin.';
  end if;
end;
$$;

create or replace function public.write_admin_management_audit(
  requesting_user_id uuid,
  target_admin_id uuid,
  summary_text text,
  metadata_value jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_record public.profiles%rowtype;
begin
  select * into actor_record from public.profiles where id = requesting_user_id;
  if to_regclass('public.audit_logs') is not null then
    insert into public.audit_logs(actor_id, actor_name, actor_email, action, entity_type, entity_id, summary, metadata)
    values (requesting_user_id, coalesce(actor_record.full_name, 'Superadmin'), coalesce(actor_record.email, ''), 'update', 'profiles', target_admin_id::text, summary_text, metadata_value);
  end if;
end;
$$;

create or replace function public.replace_admin_assignments(
  requesting_user_id uuid,
  target_admin_id uuid,
  target_class_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_name text;
  inserted_count integer := 0;
  previous_class_ids uuid[];
  removed_class_ids uuid[];
begin
  perform public.assert_active_superadmin(requesting_user_id);
  select full_name into admin_name from public.profiles where id = target_admin_id and role = 'admin' and active = true;
  if admin_name is null then raise exception 'Admin aktif tidak ditemukan.'; end if;
  if coalesce(array_length(target_class_ids, 1), 0) = 0 then raise exception 'Admin aktif harus memiliki minimal satu kelas.'; end if;
  if exists (select 1 from unnest(target_class_ids) as u(class_id_value) left join public.study_classes sc on sc.id = u.class_id_value where sc.id is null or sc.active = false) then
    raise exception 'Salah satu kelas tidak ditemukan atau sudah nonaktif.';
  end if;

  select coalesce(array_agg(class_id), '{}'::uuid[]) into previous_class_ids
  from public.admin_class_assignments where admin_id = target_admin_id;
  select coalesce(array_agg(u.class_id_value), '{}'::uuid[]) into removed_class_ids
  from unnest(previous_class_ids) as u(class_id_value)
  where not (u.class_id_value = any(target_class_ids));
  if exists (
    select 1 from unnest(removed_class_ids) as u(class_id_value)
    where not exists (
      select 1 from public.admin_class_assignments a
      join public.profiles p on p.id = a.admin_id
      where a.class_id = u.class_id_value and a.admin_id <> target_admin_id and p.active = true
    )
  ) then
    raise exception 'Penugasan tidak dapat dihapus karena salah satu kelas akan kehilangan wali. Pindahkan kelas terlebih dahulu.';
  end if;

  delete from public.admin_class_assignments where admin_id = target_admin_id;
  insert into public.admin_class_assignments(admin_id, class_id)
  select target_admin_id, u.class_id_value from unnest(target_class_ids) as u(class_id_value)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  perform public.write_admin_management_audit(requesting_user_id, target_admin_id,
    'Memperbarui penugasan kelas ' || admin_name,
    jsonb_build_object('class_ids', target_class_ids));
  return inserted_count;
end;
$$;

create or replace function public.transfer_admin_assignments(
  requesting_user_id uuid,
  source_admin_id uuid,
  target_admin_id uuid,
  target_class_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  source_name text;
  target_name text;
  moved_count integer := 0;
begin
  perform public.assert_active_superadmin(requesting_user_id);
  if source_admin_id = target_admin_id then raise exception 'Admin asal dan tujuan harus berbeda.'; end if;
  select full_name into source_name from public.profiles where id = source_admin_id and role = 'admin' and active = true;
  select full_name into target_name from public.profiles where id = target_admin_id and role = 'admin' and active = true;
  if source_name is null or target_name is null then raise exception 'Admin asal atau tujuan tidak aktif.'; end if;
  if coalesce(array_length(target_class_ids, 1), 0) = 0 then raise exception 'Pilih minimal satu kelas.'; end if;
  if exists (
    select 1 from unnest(target_class_ids) as u(class_id_value)
    where not exists (select 1 from public.admin_class_assignments a where a.admin_id = source_admin_id and a.class_id = u.class_id_value)
  ) then raise exception 'Salah satu kelas tidak lagi diampu Admin asal.'; end if;

  insert into public.admin_class_assignments(admin_id, class_id)
  select target_admin_id, u.class_id_value from unnest(target_class_ids) as u(class_id_value)
  on conflict do nothing;
  delete from public.admin_class_assignments
  where admin_id = source_admin_id and class_id = any(target_class_ids);
  get diagnostics moved_count = row_count;

  perform public.write_admin_management_audit(requesting_user_id, source_admin_id,
    'Memindahkan kelas dari ' || source_name || ' ke ' || target_name,
    jsonb_build_object('target_admin_id', target_admin_id, 'class_ids', target_class_ids));
  return moved_count;
end;
$$;

create or replace function public.set_admin_active_status(
  requesting_user_id uuid,
  target_admin_id uuid,
  new_active boolean,
  replacement_admin_id uuid default null,
  reactivation_class_ids uuid[] default '{}'::uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles%rowtype;
  replacement_name text;
  target_class_ids uuid[];
  uncovered_class_ids uuid[];
begin
  perform public.assert_active_superadmin(requesting_user_id);
  select * into target_profile from public.profiles where id = target_admin_id and role = 'admin';
  if target_profile.id is null then raise exception 'Akun Admin tidak ditemukan.'; end if;
  if target_profile.active = new_active then raise exception 'Status akun tidak berubah.'; end if;

  if new_active then
    if coalesce(array_length(reactivation_class_ids, 1), 0) = 0 then raise exception 'Pilih minimal satu kelas untuk mengaktifkan kembali Admin.'; end if;
    if exists (select 1 from unnest(reactivation_class_ids) as u(class_id_value) left join public.study_classes sc on sc.id = u.class_id_value where sc.id is null or sc.active = false) then
      raise exception 'Salah satu kelas tidak ditemukan atau sudah nonaktif.';
    end if;
    update public.profiles set active = true, must_change_password = true where id = target_admin_id;
    delete from public.admin_class_assignments where admin_id = target_admin_id;
    insert into public.admin_class_assignments(admin_id, class_id)
    select target_admin_id, u.class_id_value from unnest(reactivation_class_ids) as u(class_id_value) on conflict do nothing;
    perform public.write_admin_management_audit(requesting_user_id, target_admin_id,
      'Mengaktifkan kembali akun Admin ' || target_profile.full_name,
      jsonb_build_object('class_ids', reactivation_class_ids));
    return true;
  end if;

  select coalesce(array_agg(class_id), '{}'::uuid[]) into target_class_ids
  from public.admin_class_assignments where admin_id = target_admin_id;

  select coalesce(array_agg(u.class_id_value), '{}'::uuid[]) into uncovered_class_ids
  from unnest(target_class_ids) as u(class_id_value)
  where not exists (
    select 1 from public.admin_class_assignments other_assignment
    join public.profiles other_profile on other_profile.id = other_assignment.admin_id
    where other_assignment.class_id = u.class_id_value
      and other_assignment.admin_id <> target_admin_id
      and other_profile.active = true
  );

  if coalesce(array_length(uncovered_class_ids, 1), 0) > 0 and replacement_admin_id is null then
    raise exception 'Ada kelas yang akan kehilangan wali. Pilih Admin pengganti.';
  end if;

  if replacement_admin_id is not null then
    select full_name into replacement_name from public.profiles
    where id = replacement_admin_id and role = 'admin' and active = true and id <> target_admin_id;
    if replacement_name is null then raise exception 'Admin pengganti tidak valid atau tidak aktif.'; end if;
    insert into public.admin_class_assignments(admin_id, class_id)
    select replacement_admin_id, u.class_id_value from unnest(target_class_ids) as u(class_id_value)
    on conflict do nothing;
  end if;

  delete from public.admin_class_assignments where admin_id = target_admin_id;
  update public.profiles set active = false where id = target_admin_id;
  perform public.write_admin_management_audit(requesting_user_id, target_admin_id,
    'Menonaktifkan akun Admin ' || target_profile.full_name,
    jsonb_build_object('replacement_admin_id', replacement_admin_id, 'previous_class_ids', target_class_ids));
  return true;
end;
$$;

create or replace function public.mark_admin_password_reset(
  requesting_user_id uuid,
  target_admin_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_name text;
begin
  perform public.assert_active_superadmin(requesting_user_id);
  select full_name into target_name from public.profiles where id = target_admin_id and role = 'admin';
  if target_name is null then raise exception 'Akun Admin tidak ditemukan.'; end if;
  update public.profiles set must_change_password = true where id = target_admin_id;
  perform public.write_admin_management_audit(requesting_user_id, target_admin_id,
    'Mereset password akun Admin ' || target_name,
    '{}'::jsonb);
  return true;
end;
$$;

revoke all on function public.assert_active_superadmin(uuid) from public, anon, authenticated;
revoke all on function public.write_admin_management_audit(uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.replace_admin_assignments(uuid,uuid,uuid[]) from public, anon, authenticated;
revoke all on function public.transfer_admin_assignments(uuid,uuid,uuid,uuid[]) from public, anon, authenticated;
revoke all on function public.set_admin_active_status(uuid,uuid,boolean,uuid,uuid[]) from public, anon, authenticated;
revoke all on function public.mark_admin_password_reset(uuid,uuid) from public, anon, authenticated;
grant execute on function public.replace_admin_assignments(uuid,uuid,uuid[]) to service_role;
grant execute on function public.transfer_admin_assignments(uuid,uuid,uuid,uuid[]) to service_role;
grant execute on function public.set_admin_active_status(uuid,uuid,boolean,uuid,uuid[]) to service_role;
grant execute on function public.mark_admin_password_reset(uuid,uuid) to service_role;

-- Realtime untuk status dan login terakhir Admin.
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
