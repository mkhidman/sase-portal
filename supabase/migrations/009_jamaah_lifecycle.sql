-- Fase 8: status aktif/nonaktif, arsip jamaah, dan riwayat siklus keanggotaan.
-- Jalankan setelah migration 008_class_progression.sql.

create table if not exists public.jamaah_status_history (
  id uuid primary key default gen_random_uuid(),
  jamaah_id uuid not null references public.jamaah(id) on delete cascade,
  previous_active boolean not null,
  new_active boolean not null,
  reason text not null check (reason in ('moved','stopped','graduated','deceased','duplicate','other','reactivated')),
  effective_date date not null,
  notes text,
  class_ids uuid[] not null default '{}'::uuid[],
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (previous_active <> new_active)
);

create index if not exists jamaah_status_history_jamaah_idx
  on public.jamaah_status_history(jamaah_id, effective_date desc, created_at desc);
create index if not exists jamaah_status_history_effective_idx
  on public.jamaah_status_history(effective_date desc);

alter table public.jamaah_status_history enable row level security;

drop policy if exists "status history readable within access" on public.jamaah_status_history;
create policy "status history readable within access"
on public.jamaah_status_history for select to authenticated
using (
  public.is_superadmin()
  or exists (
    select 1
    from public.admin_class_assignments assignment
    where assignment.admin_id = auth.uid()
      and assignment.class_id = any(class_ids)
  )
);

drop policy if exists "status history managed by superadmin" on public.jamaah_status_history;
create policy "status history managed by superadmin"
on public.jamaah_status_history for all to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

grant select, insert, update, delete on public.jamaah_status_history to authenticated;

-- Admin tetap dapat membaca jamaah pada laporan lama walaupun keanggotaan aktif sudah dilepas.
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
  )
  or exists (
    select 1
    from public.jamaah_status_history history
    join public.admin_class_assignments aca
      on aca.admin_id = auth.uid()
     and aca.class_id = any(history.class_ids)
    where history.jamaah_id = target_jamaah_id
  );
$$;

grant execute on function public.jamaah_in_managed_class(uuid) to authenticated;

-- Perubahan status harus melalui RPC agar alasan, tanggal efektif, dan kelas terakhir selalu tercatat.
create or replace function public.guard_direct_jamaah_active_change()
returns trigger
language plpgsql
as $$
begin
  if old.active is distinct from new.active
     and coalesce(current_setting('app.allow_jamaah_status_change', true), '') <> 'on' then
    raise exception 'Gunakan fitur Status & Arsip untuk mengubah status aktif jamaah.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists jamaah_active_change_guard on public.jamaah;
create trigger jamaah_active_change_guard
before update of active on public.jamaah
for each row execute function public.guard_direct_jamaah_active_change();

create or replace function public.change_jamaah_active_status(
  target_jamaah_id uuid,
  target_active boolean,
  change_reason text,
  transition_date date,
  transition_notes text default null,
  restore_class_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_active boolean;
  retained_class_ids uuid[] := '{}'::uuid[];
  requested_class_ids uuid[] := '{}'::uuid[];
  history_id uuid;
  transition_month text;
  requested_count integer := 0;
  valid_count integer := 0;
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat mengubah status jamaah.' using errcode = '42501';
  end if;

  if change_reason not in ('moved','stopped','graduated','deceased','duplicate','other','reactivated') then
    raise exception 'Alasan perubahan status tidak valid.' using errcode = '22023';
  end if;

  transition_month := substring(transition_date::text from 1 for 7);
  if to_regprocedure('public.is_reporting_period_closed(text)') is not null
     and public.is_reporting_period_closed(transition_month) then
    raise exception 'Periode % sudah ditutup. Pilih tanggal efektif pada periode terbuka.', transition_month
      using errcode = 'P0001';
  end if;

  select active into current_active
  from public.jamaah
  where id = target_jamaah_id
  for update;

  if current_active is null then
    raise exception 'Data jamaah tidak ditemukan.' using errcode = 'P0002';
  end if;

  if current_active = target_active then
    if target_active then
      raise exception 'Jamaah sudah aktif.' using errcode = 'P0001';
    else
      raise exception 'Jamaah sudah nonaktif.' using errcode = 'P0001';
    end if;
  end if;

  if target_active then
    select coalesce(array_agg(distinct class_id), '{}'::uuid[])
    into requested_class_ids
    from unnest(coalesce(restore_class_ids, '{}'::uuid[])) as requested(class_id);

    requested_count := cardinality(requested_class_ids);
    if requested_count = 0 then
      raise exception 'Pilih minimal satu kelas untuk mengaktifkan kembali jamaah.' using errcode = '22023';
    end if;

    select count(*) into valid_count
    from public.study_classes
    where active = true and id = any(requested_class_ids);

    if valid_count <> requested_count then
      raise exception 'Salah satu kelas yang dipilih tidak ditemukan atau sudah tidak aktif.' using errcode = '22023';
    end if;

    retained_class_ids := requested_class_ids;
    perform set_config('app.allow_jamaah_status_change', 'on', true);
    update public.jamaah set active = true where id = target_jamaah_id;

    insert into public.jamaah_classes (jamaah_id, class_id)
    select target_jamaah_id, class_id from unnest(retained_class_ids) as selected(class_id)
    on conflict (jamaah_id, class_id) do nothing;

    change_reason := 'reactivated';
  else
    select coalesce(array_agg(class_id order by class_id), '{}'::uuid[])
    into retained_class_ids
    from public.jamaah_classes
    where jamaah_id = target_jamaah_id;

    delete from public.jamaah_classes where jamaah_id = target_jamaah_id;
    perform set_config('app.allow_jamaah_status_change', 'on', true);
    update public.jamaah set active = false where id = target_jamaah_id;
  end if;

  insert into public.jamaah_status_history (
    jamaah_id,
    previous_active,
    new_active,
    reason,
    effective_date,
    notes,
    class_ids,
    changed_by
  ) values (
    target_jamaah_id,
    current_active,
    target_active,
    change_reason,
    transition_date,
    nullif(trim(transition_notes), ''),
    retained_class_ids,
    auth.uid()
  ) returning id into history_id;

  return history_id;
end;
$$;

grant execute on function public.change_jamaah_active_status(uuid, boolean, text, date, text, uuid[]) to authenticated;


-- Sesuaikan import massal: jamaah nonaktif masuk arsip dan tidak menjadi anggota kelas aktif.
create or replace function public.bulk_import_jamaah(items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  imported_id uuid;
  imported_active boolean;
  imported_class_ids uuid[];
  imported_count integer := 0;
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat mengimpor data sensus.' using errcode = '42501';
  end if;

  if jsonb_typeof(items) <> 'array' then
    raise exception 'Payload import harus berupa array.';
  end if;

  for item in select value from jsonb_array_elements(items)
  loop
    imported_id := (item ->> 'id')::uuid;
    imported_active := coalesce((item ->> 'active')::boolean, true);

    select coalesce(array_agg(value::uuid), '{}'::uuid[])
    into imported_class_ids
    from jsonb_array_elements_text(coalesce(item -> 'classIds', '[]'::jsonb));

    insert into public.jamaah (
      id,
      full_name,
      gender,
      birth_date,
      phone,
      census_category,
      active,
      created_by
    ) values (
      imported_id,
      trim(item ->> 'fullName'),
      (item ->> 'gender')::public.gender_type,
      nullif(trim(coalesce(item ->> 'birthDate', '')), '')::date,
      nullif(trim(coalesce(item ->> 'phone', '')), ''),
      item ->> 'censusCategory',
      imported_active,
      auth.uid()
    );

    if imported_active then
      insert into public.jamaah_classes (jamaah_id, class_id)
      select imported_id, selected.class_id
      from unnest(imported_class_ids) as selected(class_id);
    else
      insert into public.jamaah_status_history (
        jamaah_id,
        previous_active,
        new_active,
        reason,
        effective_date,
        notes,
        class_ids,
        changed_by
      ) values (
        imported_id,
        true,
        false,
        'other',
        current_date,
        'Diimpor sebagai data nonaktif.',
        imported_class_ids,
        auth.uid()
      );
    end if;

    imported_count := imported_count + 1;
  end loop;

  return imported_count;
end;
$$;

revoke all on function public.bulk_import_jamaah(jsonb) from public;
grant execute on function public.bulk_import_jamaah(jsonb) to authenticated;

create or replace function public.write_jamaah_status_audit()
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
begin
  select full_name, email into actor_full_name, actor_mail
  from public.profiles where id = actor_uuid;
  select full_name into jamaah_name from public.jamaah where id = new.jamaah_id;

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
    'jamaah_status_history',
    new.id::text,
    case when new.new_active
      then 'Mengaktifkan kembali ' || coalesce(jamaah_name, 'jamaah')
      else 'Mengarsipkan ' || coalesce(jamaah_name, 'jamaah')
    end,
    to_jsonb(new)
  );
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.audit_logs') is not null then
    drop trigger if exists jamaah_status_history_audit_trigger on public.jamaah_status_history;
    create trigger jamaah_status_history_audit_trigger
    after insert on public.jamaah_status_history
    for each row execute function public.write_jamaah_status_audit();
  end if;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.jamaah_status_history;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
