-- Fase 5: pemantauan kehadiran dan tindak lanjut jamaah.
-- Jalankan setelah migration 005_operational_reliability.sql.

create table if not exists public.jamaah_follow_ups (
  id uuid primary key default gen_random_uuid(),
  jamaah_id uuid not null references public.jamaah(id) on delete cascade,
  class_id uuid not null references public.study_classes(id) on delete cascade,
  period_month text not null check (period_month ~ '^[0-9]{4}-[0-9]{2}$'),
  status text not null default 'pending' check (status in ('pending','contacted','visit_needed','resolved')),
  trigger_type text not null default 'manual' check (trigger_type in ('low_attendance','consecutive_absence','manual')),
  attendance_rate integer not null default 0 check (attendance_rate between 0 and 100),
  absence_count integer not null default 0 check (absence_count >= 0),
  consecutive_absence integer not null default 0 check (consecutive_absence >= 0),
  notes text,
  next_follow_up_date date,
  recorded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jamaah_id, class_id, period_month)
);

create index if not exists jamaah_follow_ups_class_month_idx
  on public.jamaah_follow_ups(class_id, period_month, status);
create index if not exists jamaah_follow_ups_next_date_idx
  on public.jamaah_follow_ups(next_follow_up_date)
  where status <> 'resolved';

drop trigger if exists jamaah_follow_ups_set_updated_at on public.jamaah_follow_ups;
create trigger jamaah_follow_ups_set_updated_at
before update on public.jamaah_follow_ups
for each row execute function public.set_updated_at();

alter table public.jamaah_follow_ups enable row level security;

drop policy if exists "follow ups read within access" on public.jamaah_follow_ups;
create policy "follow ups read within access"
on public.jamaah_follow_ups for select to authenticated
using (public.can_manage_class(class_id) and public.jamaah_in_managed_class(jamaah_id));

drop policy if exists "follow ups inserted within access" on public.jamaah_follow_ups;
create policy "follow ups inserted within access"
on public.jamaah_follow_ups for insert to authenticated
with check (public.can_manage_class(class_id) and public.jamaah_in_managed_class(jamaah_id));

drop policy if exists "follow ups updated within access" on public.jamaah_follow_ups;
create policy "follow ups updated within access"
on public.jamaah_follow_ups for update to authenticated
using (public.can_manage_class(class_id) and public.jamaah_in_managed_class(jamaah_id))
with check (public.can_manage_class(class_id) and public.jamaah_in_managed_class(jamaah_id));

drop policy if exists "follow ups deleted within access" on public.jamaah_follow_ups;
create policy "follow ups deleted within access"
on public.jamaah_follow_ups for delete to authenticated
using (public.can_manage_class(class_id) and public.jamaah_in_managed_class(jamaah_id));

grant select, insert, update, delete on public.jamaah_follow_ups to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.jamaah_follow_ups;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- Gunakan fungsi audit dari fase 4. Bila migration 005 belum dijalankan,
-- jalankan migration tersebut terlebih dahulu.
drop trigger if exists jamaah_follow_ups_audit_trigger on public.jamaah_follow_ups;
create trigger jamaah_follow_ups_audit_trigger
after insert or update or delete on public.jamaah_follow_ups
for each row execute function public.write_audit_log();
