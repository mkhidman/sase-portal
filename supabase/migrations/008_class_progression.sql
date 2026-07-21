-- Fase 7: kenaikan kelas, mutasi jamaah, dan histori keanggotaan.
-- Jalankan setelah migration 007_monthly_reporting.sql.

create table if not exists public.class_membership_history (
  id uuid primary key default gen_random_uuid(),
  jamaah_id uuid not null references public.jamaah(id) on delete cascade,
  from_class_id uuid references public.study_classes(id) on delete set null,
  to_class_id uuid references public.study_classes(id) on delete set null,
  previous_census_category text not null,
  new_census_category text not null,
  effective_date date not null,
  change_type text not null default 'promotion' check (change_type in ('promotion','transfer','manual')),
  notes text,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_class_id is not null or to_class_id is not null)
);

create index if not exists class_membership_history_jamaah_idx
  on public.class_membership_history(jamaah_id, effective_date desc, created_at desc);
create index if not exists class_membership_history_classes_idx
  on public.class_membership_history(from_class_id, to_class_id, effective_date desc);

alter table public.class_membership_history enable row level security;

drop policy if exists "class history readable within access" on public.class_membership_history;
create policy "class history readable within access"
on public.class_membership_history for select to authenticated
using (
  public.is_superadmin()
  or (from_class_id is not null and public.can_manage_class(from_class_id))
  or (to_class_id is not null and public.can_manage_class(to_class_id))
);

drop policy if exists "class history managed by superadmin" on public.class_membership_history;
create policy "class history managed by superadmin"
on public.class_membership_history for all to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

grant select, insert, update, delete on public.class_membership_history to authenticated;

-- Pertahankan akses Admin terhadap jamaah yang pernah berada di kelasnya agar laporan historis tetap lengkap.
create or replace function public.jamaah_in_managed_class(target_jamaah_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_superadmin()
  or exists (
    select 1
    from public.jamaah_classes jc
    join public.admin_class_assignments aca on aca.class_id = jc.class_id
    where jc.jamaah_id = target_jamaah_id and aca.admin_id = auth.uid()
  )
  or exists (
    select 1
    from public.class_membership_history history
    join public.admin_class_assignments aca
      on aca.admin_id = auth.uid()
     and (aca.class_id = history.from_class_id or aca.class_id = history.to_class_id)
    where history.jamaah_id = target_jamaah_id
  );
$$;

grant execute on function public.jamaah_in_managed_class(uuid) to authenticated;

create or replace function public.census_category_for_class(target_class_name text, fallback_category text)
returns text
language sql
immutable
as $$
  select case target_class_name
    when 'Playgroup' then 'Balita'
    when 'PAUD' then 'Caberawit'
    when 'Caberawit Kelas A' then 'Caberawit'
    when 'Caberawit Kelas B' then 'Caberawit'
    when 'Caberawit Kelas C' then 'Caberawit'
    when 'Pra Remaja' then 'Pra Remaja'
    when 'Remaja' then 'Remaja'
    when 'Pra Nikah' then 'Usia Nikah'
    else fallback_category
  end;
$$;

grant execute on function public.census_category_for_class(text, text) to authenticated;

create or replace function public.bulk_transition_jamaah_classes(
  target_jamaah_ids uuid[],
  source_class_id uuid,
  destination_class_id uuid,
  transition_date date,
  transition_type text default 'promotion',
  transition_notes text default null,
  update_census boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  source_name text;
  destination_name text;
  old_category text;
  next_category text;
  changed_count integer := 0;
  transition_month text;
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat melakukan kenaikan kelas atau mutasi.' using errcode = '42501';
  end if;

  if source_class_id is null or destination_class_id is null or source_class_id = destination_class_id then
    raise exception 'Kelas asal dan kelas tujuan harus berbeda.' using errcode = '22023';
  end if;

  if transition_type not in ('promotion','transfer','manual') then
    raise exception 'Jenis perubahan kelas tidak valid.' using errcode = '22023';
  end if;

  if coalesce(array_length(target_jamaah_ids, 1), 0) = 0 then
    return 0;
  end if;

  transition_month := substring(transition_date::text from 1 for 7);
  if to_regprocedure('public.is_reporting_period_closed(text)') is not null
     and public.is_reporting_period_closed(transition_month) then
    raise exception 'Periode % sudah ditutup. Gunakan tanggal efektif pada periode yang masih terbuka.', transition_month
      using errcode = 'P0001';
  end if;

  select name into source_name from public.study_classes where id = source_class_id and active = true;
  select name into destination_name from public.study_classes where id = destination_class_id and active = true;

  if source_name is null or destination_name is null then
    raise exception 'Kelas asal atau kelas tujuan tidak ditemukan/tidak aktif.' using errcode = 'P0002';
  end if;

  foreach target_id in array target_jamaah_ids
  loop
    select census_category into old_category
    from public.jamaah
    where id = target_id and active = true
    for update;

    if old_category is null then
      continue;
    end if;

    if not exists (
      select 1 from public.jamaah_classes
      where jamaah_id = target_id and class_id = source_class_id
    ) then
      continue;
    end if;

    next_category := case when update_census
      then public.census_category_for_class(destination_name, old_category)
      else old_category
    end;

    delete from public.jamaah_classes
    where jamaah_id = target_id and class_id = source_class_id;

    insert into public.jamaah_classes (jamaah_id, class_id)
    values (target_id, destination_class_id)
    on conflict (jamaah_id, class_id) do nothing;

    if next_category <> old_category then
      update public.jamaah
      set census_category = next_category
      where id = target_id;
    end if;

    insert into public.class_membership_history (
      jamaah_id,
      from_class_id,
      to_class_id,
      previous_census_category,
      new_census_category,
      effective_date,
      change_type,
      notes,
      changed_by
    ) values (
      target_id,
      source_class_id,
      destination_class_id,
      old_category,
      next_category,
      transition_date,
      transition_type,
      nullif(trim(transition_notes), ''),
      auth.uid()
    );

    changed_count := changed_count + 1;
  end loop;

  return changed_count;
end;
$$;

grant execute on function public.bulk_transition_jamaah_classes(uuid[], uuid, uuid, date, text, text, boolean) to authenticated;

-- Audit khusus agar riwayat aktivitas mudah dibaca.
create or replace function public.write_class_transition_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  actor_full_name text;
  actor_mail text;
  jamaah_name text;
  source_name text;
  destination_name text;
begin
  select full_name, email into actor_full_name, actor_mail
  from public.profiles where id = actor_uuid;

  select full_name into jamaah_name from public.jamaah where id = new.jamaah_id;
  select name into source_name from public.study_classes where id = new.from_class_id;
  select name into destination_name from public.study_classes where id = new.to_class_id;

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
    coalesce(actor_full_name, 'Sistem'),
    coalesce(actor_mail, ''),
    'insert',
    'class_membership_history',
    new.id::text,
    case new.change_type
      when 'promotion' then 'Menaikkan kelas ' || coalesce(jamaah_name, 'jamaah') || ' dari ' || coalesce(source_name, '-') || ' ke ' || coalesce(destination_name, '-')
      when 'transfer' then 'Memindahkan ' || coalesce(jamaah_name, 'jamaah') || ' dari ' || coalesce(source_name, '-') || ' ke ' || coalesce(destination_name, '-')
      else 'Memperbarui kelas ' || coalesce(jamaah_name, 'jamaah') || ' dari ' || coalesce(source_name, '-') || ' ke ' || coalesce(destination_name, '-')
    end,
    to_jsonb(new)
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.audit_logs') is not null then
    drop trigger if exists class_membership_history_audit_trigger on public.class_membership_history;
    create trigger class_membership_history_audit_trigger
    after insert on public.class_membership_history
    for each row execute function public.write_class_transition_audit();
  end if;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.class_membership_history;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
