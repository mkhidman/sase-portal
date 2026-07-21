-- Fase 4: audit aktivitas operasional.
-- Jalankan setelah migration 004_optional_birth_date.sql.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default 'Sistem',
  actor_email text not null default '',
  action text not null check (action in ('insert', 'update', 'delete')),
  entity_type text not null,
  entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "superadmin reads audit logs" on public.audit_logs;
create policy "superadmin reads audit logs"
on public.audit_logs for select
to authenticated
using (public.is_superadmin());

grant select on public.audit_logs to authenticated;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  actor_uuid uuid;
  actor_full_name text;
  actor_mail text;
  entity_key text;
  log_summary text;
  class_name text;
  profile_name text;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  actor_uuid := auth.uid();

  select p.full_name, p.email
  into actor_full_name, actor_mail
  from public.profiles p
  where p.id = actor_uuid;

  actor_full_name := coalesce(actor_full_name, 'Sistem');
  actor_mail := coalesce(actor_mail, '');
  entity_key := coalesce(
    row_data ->> 'id',
    row_data ->> 'jamaah_id',
    row_data ->> 'admin_id',
    row_data ->> 'session_id'
  );

  if tg_table_name = 'jamaah' then
    log_summary := case tg_op
      when 'INSERT' then 'Menambahkan jamaah ' || coalesce(row_data ->> 'full_name', '')
      when 'UPDATE' then 'Memperbarui jamaah ' || coalesce(row_data ->> 'full_name', '')
      else 'Menghapus jamaah ' || coalesce(row_data ->> 'full_name', '')
    end;
  elsif tg_table_name = 'schedules' then
    select sc.name into class_name from public.study_classes sc where sc.id = (row_data ->> 'class_id')::uuid;
    log_summary := case tg_op
      when 'INSERT' then 'Membuat jadwal ' || coalesce(class_name, 'kelas') || ' tanggal ' || coalesce(row_data ->> 'date', '')
      when 'UPDATE' then 'Memperbarui jadwal ' || coalesce(class_name, 'kelas') || ' tanggal ' || coalesce(row_data ->> 'date', '')
      else 'Menghapus jadwal ' || coalesce(class_name, 'kelas') || ' tanggal ' || coalesce(row_data ->> 'date', '')
    end;
  elsif tg_table_name = 'attendance_sessions' then
    select sc.name into class_name from public.study_classes sc where sc.id = (row_data ->> 'class_id')::uuid;
    log_summary := case tg_op
      when 'INSERT' then 'Menyimpan absensi ' || coalesce(class_name, 'kelas') || ' tanggal ' || coalesce(row_data ->> 'date', '')
      when 'UPDATE' then 'Memperbarui absensi ' || coalesce(class_name, 'kelas') || ' tanggal ' || coalesce(row_data ->> 'date', '')
      else 'Menghapus absensi ' || coalesce(class_name, 'kelas') || ' tanggal ' || coalesce(row_data ->> 'date', '')
    end;
  elsif tg_table_name = 'material_completions' then
    log_summary := case tg_op
      when 'INSERT' then 'Menandai ketuntasan ' || upper(coalesce(row_data ->> 'material_type', 'materi'))
      when 'UPDATE' then 'Memperbarui ketuntasan ' || upper(coalesce(row_data ->> 'material_type', 'materi'))
      else 'Membatalkan ketuntasan ' || upper(coalesce(row_data ->> 'material_type', 'materi'))
    end;
  elsif tg_table_name = 'admin_class_assignments' then
    select p.full_name into profile_name from public.profiles p where p.id = (row_data ->> 'admin_id')::uuid;
    select sc.name into class_name from public.study_classes sc where sc.id = (row_data ->> 'class_id')::uuid;
    entity_key := coalesce(row_data ->> 'admin_id', '') || ':' || coalesce(row_data ->> 'class_id', '');
    log_summary := case tg_op
      when 'INSERT' then 'Menugaskan ' || coalesce(profile_name, 'Admin') || ' ke ' || coalesce(class_name, 'kelas')
      when 'UPDATE' then 'Memperbarui penugasan ' || coalesce(profile_name, 'Admin')
      else 'Menghapus penugasan ' || coalesce(profile_name, 'Admin') || ' dari ' || coalesce(class_name, 'kelas')
    end;
  else
    log_summary := initcap(replace(tg_op, '_', ' ')) || ' ' || tg_table_name;
  end if;

  insert into public.audit_logs (
    actor_id,
    actor_name,
    actor_email,
    action,
    entity_type,
    entity_id,
    summary,
    metadata
  ) values (
    actor_uuid,
    actor_full_name,
    actor_mail,
    lower(tg_op),
    tg_table_name,
    entity_key,
    log_summary,
    row_data
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['jamaah','schedules','attendance_sessions','material_completions','admin_class_assignments']
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_audit_trigger', table_name);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.write_audit_log()',
      table_name || '_audit_trigger',
      table_name
    );
  end loop;
end;
$$;

-- Tambahkan ke Realtime bila belum ada.
do $$
begin
  alter publication supabase_realtime add table public.audit_logs;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
