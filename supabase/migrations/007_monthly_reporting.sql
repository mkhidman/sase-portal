-- Fase 6: laporan bulanan dan penguncian periode.
-- Jalankan setelah migration 006_attendance_follow_up.sql.

create table if not exists public.reporting_periods (
  id uuid primary key default gen_random_uuid(),
  month text not null unique check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'closed' and closed_at is not null) or (status = 'open'))
);

create index if not exists reporting_periods_month_idx on public.reporting_periods(month desc);

drop trigger if exists reporting_periods_set_updated_at on public.reporting_periods;
create trigger reporting_periods_set_updated_at
before update on public.reporting_periods
for each row execute function public.set_updated_at();

alter table public.reporting_periods enable row level security;

drop policy if exists "reporting periods readable" on public.reporting_periods;
create policy "reporting periods readable"
on public.reporting_periods for select to authenticated
using (true);

drop policy if exists "reporting periods managed by superadmin" on public.reporting_periods;
create policy "reporting periods managed by superadmin"
on public.reporting_periods for all to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

grant select, insert, update, delete on public.reporting_periods to authenticated;

create or replace function public.is_reporting_period_closed(target_month text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.reporting_periods
    where month = target_month and status = 'closed'
  );
$$;

grant execute on function public.is_reporting_period_closed(text) to authenticated;

create or replace function public.prevent_closed_period_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  old_data jsonb;
  target_month text;
  previous_month text;
  target_session_id uuid;
  previous_session_id uuid;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_data := case when tg_op = 'INSERT' then null else to_jsonb(old) end;

  if tg_table_name in ('schedules', 'attendance_sessions') then
    target_month := substring(row_data ->> 'date' from 1 for 7);
    previous_month := case when old_data is null then null else substring(old_data ->> 'date' from 1 for 7) end;
  elsif tg_table_name = 'attendance_records' then
    target_session_id := (row_data ->> 'session_id')::uuid;
    select substring(s.date::text from 1 for 7) into target_month
      from public.attendance_sessions s where s.id = target_session_id;
    if old_data is not null then
      previous_session_id := (old_data ->> 'session_id')::uuid;
      select substring(s.date::text from 1 for 7) into previous_month
        from public.attendance_sessions s where s.id = previous_session_id;
    end if;
  elsif tg_table_name = 'material_completions' then
    target_month := row_data ->> 'month';
    previous_month := case when old_data is null then null else old_data ->> 'month' end;
  elsif tg_table_name = 'jamaah_follow_ups' then
    target_month := row_data ->> 'period_month';
    previous_month := case when old_data is null then null else old_data ->> 'period_month' end;
  end if;

  if (target_month is not null and public.is_reporting_period_closed(target_month))
     or (previous_month is not null and public.is_reporting_period_closed(previous_month)) then
    raise exception 'Periode % sudah ditutup dan tidak dapat diubah.', coalesce(previous_month, target_month)
      using errcode = 'P0001';
  end if;

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
  foreach table_name in array array['schedules','attendance_sessions','attendance_records','material_completions','jamaah_follow_ups']
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_closed_period_guard', table_name);
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function public.prevent_closed_period_changes()',
      table_name || '_closed_period_guard',
      table_name
    );
  end loop;
end;
$$;

-- Catat perubahan status periode pada audit bila migration fase 4 sudah aktif.
do $$
begin
  if to_regprocedure('public.write_audit_log()') is not null then
    drop trigger if exists reporting_periods_audit_trigger on public.reporting_periods;
    create trigger reporting_periods_audit_trigger
    after insert or update or delete on public.reporting_periods
    for each row execute function public.write_audit_log();
  end if;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.reporting_periods;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
