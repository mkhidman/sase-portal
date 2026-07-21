-- Sensus Jamaah - initial schema
-- Jalankan melalui Supabase CLI atau SQL Editor pada project baru.

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('superadmin', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.gender_type as enum ('Laki-laki', 'Perempuan');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.material_type as enum ('hasda', 'asad', 'general', 'evaluation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('present', 'excused', 'sick', 'absent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.completion_source as enum ('main_session', 'follow_up');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.app_role not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_class_assignments (
  admin_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.study_classes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (admin_id, class_id)
);

create table if not exists public.jamaah (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  gender public.gender_type not null,
  birth_date date,
  phone text,
  census_category text not null check (census_category in ('Balita','Caberawit','Pra Remaja','Remaja','Usia Nikah','Menikah','Duda & Janda')),
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jamaah_classes (
  jamaah_id uuid not null references public.jamaah(id) on delete cascade,
  class_id uuid not null references public.study_classes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (jamaah_id, class_id)
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  class_id uuid not null references public.study_classes(id) on delete cascade,
  material_type public.material_type not null,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  class_id uuid not null references public.study_classes(id) on delete cascade,
  material_type public.material_type not null,
  created_by uuid references public.profiles(id),
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, class_id, material_type)
);

create table if not exists public.attendance_records (
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  jamaah_id uuid not null references public.jamaah(id) on delete cascade,
  status public.attendance_status not null default 'absent',
  updated_at timestamptz not null default now(),
  primary key (session_id, jamaah_id)
);

create table if not exists public.material_completions (
  id uuid primary key default gen_random_uuid(),
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  material_type public.material_type not null check (material_type in ('hasda','asad')),
  jamaah_id uuid not null references public.jamaah(id) on delete cascade,
  class_id uuid references public.study_classes(id) on delete set null,
  source public.completion_source not null,
  completed_on date not null,
  source_session_id uuid references public.attendance_sessions(id) on delete cascade,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, material_type, jamaah_id),
  check ((source = 'main_session' and source_session_id is not null) or (source = 'follow_up' and source_session_id is null))
);

create index if not exists jamaah_name_idx on public.jamaah using gin (to_tsvector('simple', full_name));
create index if not exists jamaah_classes_class_idx on public.jamaah_classes(class_id);
create index if not exists schedules_date_idx on public.schedules(date, class_id);
create index if not exists attendance_sessions_date_idx on public.attendance_sessions(date, class_id);
create index if not exists material_completions_month_idx on public.material_completions(month, material_type);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists jamaah_set_updated_at on public.jamaah;
create trigger jamaah_set_updated_at before update on public.jamaah for each row execute function public.set_updated_at();
drop trigger if exists schedules_set_updated_at on public.schedules;
create trigger schedules_set_updated_at before update on public.schedules for each row execute function public.set_updated_at();
drop trigger if exists attendance_sessions_set_updated_at on public.attendance_sessions;
create trigger attendance_sessions_set_updated_at before update on public.attendance_sessions for each row execute function public.set_updated_at();
drop trigger if exists material_completions_set_updated_at on public.material_completions;
create trigger material_completions_set_updated_at before update on public.material_completions for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, ''),
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'admin')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Helper RLS. SECURITY DEFINER dibatasi hanya untuk pemeriksaan akses.
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin'
  );
$$;

create or replace function public.can_manage_class(target_class_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_superadmin() or exists (
    select 1 from public.admin_class_assignments
    where admin_id = auth.uid() and class_id = target_class_id
  );
$$;

create or replace function public.jamaah_in_managed_class(target_jamaah_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_superadmin() or exists (
    select 1
    from public.jamaah_classes jc
    join public.admin_class_assignments aca on aca.class_id = jc.class_id
    where jc.jamaah_id = target_jamaah_id and aca.admin_id = auth.uid()
  );
$$;

grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.can_manage_class(uuid) to authenticated;
grant execute on function public.jamaah_in_managed_class(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.study_classes enable row level security;
alter table public.admin_class_assignments enable row level security;
alter table public.jamaah enable row level security;
alter table public.jamaah_classes enable row level security;
alter table public.schedules enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.material_completions enable row level security;

create policy "profiles read own or superadmin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_superadmin());
create policy "profiles managed by superadmin" on public.profiles for update to authenticated
using (public.is_superadmin()) with check (public.is_superadmin());

create policy "classes readable" on public.study_classes for select to authenticated using (true);
create policy "classes managed by superadmin" on public.study_classes for all to authenticated
using (public.is_superadmin()) with check (public.is_superadmin());

create policy "assignments read own or superadmin" on public.admin_class_assignments for select to authenticated
using (admin_id = auth.uid() or public.is_superadmin());
create policy "assignments managed by superadmin" on public.admin_class_assignments for all to authenticated
using (public.is_superadmin()) with check (public.is_superadmin());

create policy "jamaah read within access" on public.jamaah for select to authenticated
using (public.is_superadmin() or public.jamaah_in_managed_class(id));
create policy "jamaah managed by superadmin" on public.jamaah for all to authenticated
using (public.is_superadmin()) with check (public.is_superadmin());

create policy "jamaah classes read within access" on public.jamaah_classes for select to authenticated
using (public.is_superadmin() or public.can_manage_class(class_id));
create policy "jamaah classes managed by superadmin" on public.jamaah_classes for all to authenticated
using (public.is_superadmin()) with check (public.is_superadmin());

create policy "schedules read within access" on public.schedules for select to authenticated
using (public.can_manage_class(class_id));
create policy "schedules managed by superadmin" on public.schedules for all to authenticated
using (public.is_superadmin()) with check (public.is_superadmin());

create policy "attendance sessions within access" on public.attendance_sessions for select to authenticated
using (public.can_manage_class(class_id));
create policy "attendance sessions inserted within access" on public.attendance_sessions for insert to authenticated
with check (public.can_manage_class(class_id));
create policy "attendance sessions updated within access" on public.attendance_sessions for update to authenticated
using (public.can_manage_class(class_id)) with check (public.can_manage_class(class_id));
create policy "attendance sessions deleted within access" on public.attendance_sessions for delete to authenticated
using (public.can_manage_class(class_id));

create policy "attendance records within access" on public.attendance_records for select to authenticated
using (exists (select 1 from public.attendance_sessions s where s.id = session_id and public.can_manage_class(s.class_id)));
create policy "attendance records inserted within access" on public.attendance_records for insert to authenticated
with check (exists (select 1 from public.attendance_sessions s where s.id = session_id and public.can_manage_class(s.class_id)));
create policy "attendance records updated within access" on public.attendance_records for update to authenticated
using (exists (select 1 from public.attendance_sessions s where s.id = session_id and public.can_manage_class(s.class_id)))
with check (exists (select 1 from public.attendance_sessions s where s.id = session_id and public.can_manage_class(s.class_id)));
create policy "attendance records deleted within access" on public.attendance_records for delete to authenticated
using (exists (select 1 from public.attendance_sessions s where s.id = session_id and public.can_manage_class(s.class_id)));

create policy "material completion read within access" on public.material_completions for select to authenticated
using (public.is_superadmin() or (class_id is not null and public.can_manage_class(class_id)) or public.jamaah_in_managed_class(jamaah_id));
create policy "material completion inserted within access" on public.material_completions for insert to authenticated
with check (public.is_superadmin() or (class_id is not null and public.can_manage_class(class_id) and public.jamaah_in_managed_class(jamaah_id)));
create policy "material completion updated within access" on public.material_completions for update to authenticated
using (public.is_superadmin() or (class_id is not null and public.can_manage_class(class_id)))
with check (public.is_superadmin() or (class_id is not null and public.can_manage_class(class_id) and public.jamaah_in_managed_class(jamaah_id)));
create policy "material completion deleted within access" on public.material_completions for delete to authenticated
using (public.is_superadmin() or (class_id is not null and public.can_manage_class(class_id)));

insert into public.study_classes (name, sort_order) values
  ('Playgroup', 10),
  ('PAUD', 20),
  ('Caberawit Kelas A', 30),
  ('Caberawit Kelas B', 40),
  ('Caberawit Kelas C', 50),
  ('Pra Remaja', 60),
  ('Remaja', 70),
  ('Pra Nikah', 80),
  ('Pengajian Umum', 90),
  ('Pengajian Ibu-Ibu', 100),
  ('Pengajian Usia Istimewa', 110),
  ('5 Unsur', 120)
on conflict (name) do update set sort_order = excluded.sort_order, active = true;

-- Setelah membuat user pertama melalui Authentication, jadikan Superadmin:
-- update public.profiles set role = 'superadmin' where email = 'email-anda@example.com';
