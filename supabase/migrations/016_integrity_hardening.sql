-- Fase 14: hardening integritas data.
-- Menyatukan penyimpanan profil+kelas warga dan absensi+ketuntasan materi,
-- melindungi ketuntasan sesi utama, serta menolak tanggal efektif masa depan.

create or replace function public.save_jamaah_record(
  target_jamaah_id uuid,
  jamaah_full_name text,
  jamaah_gender public.gender_type,
  jamaah_birth_date date,
  jamaah_phone text,
  jamaah_census_category text,
  jamaah_active boolean,
  jamaah_class_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_jamaah_id uuid;
  normalized_class_ids uuid[];
  requested_class_count integer;
  valid_class_count integer;
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat mengubah data sensus.' using errcode = '42501';
  end if;

  if nullif(trim(jamaah_full_name), '') is null then
    raise exception 'Nama lengkap wajib diisi.' using errcode = '22023';
  end if;

  if jamaah_census_category not in ('Balita','Caberawit','Pra Remaja','Remaja','Usia Nikah','Menikah','Duda & Janda') then
    raise exception 'Kategori sensus tidak valid.' using errcode = '22023';
  end if;

  if jamaah_birth_date is not null and jamaah_birth_date > current_date then
    raise exception 'Tanggal lahir tidak boleh berada di masa depan.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct selected.class_id), '{}'::uuid[])
  into normalized_class_ids
  from unnest(coalesce(jamaah_class_ids, '{}'::uuid[])) as selected(class_id);

  requested_class_count := cardinality(normalized_class_ids);
  select count(*) into valid_class_count
  from public.study_classes
  where active = true and id = any(normalized_class_ids);

  if valid_class_count <> requested_class_count then
    raise exception 'Salah satu kelas tidak ditemukan atau sudah nonaktif.' using errcode = '22023';
  end if;

  if target_jamaah_id is null then
    insert into public.jamaah (
      full_name, gender, birth_date, phone, census_category, active, created_by
    ) values (
      trim(jamaah_full_name),
      jamaah_gender,
      jamaah_birth_date,
      nullif(trim(jamaah_phone), ''),
      jamaah_census_category,
      jamaah_active,
      auth.uid()
    ) returning id into resolved_jamaah_id;
  else
    update public.jamaah
    set full_name = trim(jamaah_full_name),
        gender = jamaah_gender,
        birth_date = jamaah_birth_date,
        phone = nullif(trim(jamaah_phone), ''),
        census_category = jamaah_census_category,
        active = jamaah_active
    where id = target_jamaah_id
    returning id into resolved_jamaah_id;

    if resolved_jamaah_id is null then
      raise exception 'Data warga tidak ditemukan.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.jamaah_classes where jamaah_id = resolved_jamaah_id;
  insert into public.jamaah_classes (jamaah_id, class_id)
  select resolved_jamaah_id, selected.class_id
  from unnest(normalized_class_ids) as selected(class_id);

  return resolved_jamaah_id;
end;
$$;

revoke all on function public.save_jamaah_record(uuid,text,public.gender_type,date,text,text,boolean,uuid[]) from public;
grant execute on function public.save_jamaah_record(uuid,text,public.gender_type,date,text,text,boolean,uuid[]) to authenticated;


create or replace function public.save_attendance_session_complete(
  target_session_id uuid,
  session_date date,
  target_class_id uuid,
  target_material_type public.material_type,
  target_material_name text,
  session_notes text,
  session_saved_at timestamptz,
  expected_revision integer,
  record_items jsonb,
  completion_jamaah_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_result jsonb;
  resolved_session_id uuid;
  normalized_completion_ids uuid[];
  requested_completion_count integer;
  valid_completion_count integer;
  completion_rows jsonb;
begin
  if session_date > current_date then
    raise exception 'Absensi tidak dapat disimpan untuk tanggal yang belum berlangsung.' using errcode = '22023';
  end if;

  session_result := public.save_attendance_session_safe(
    target_session_id,
    session_date,
    target_class_id,
    target_material_type,
    target_material_name,
    session_notes,
    session_saved_at,
    expected_revision,
    record_items
  );

  resolved_session_id := (session_result ->> 'id')::uuid;

  select coalesce(array_agg(distinct selected.jamaah_id), '{}'::uuid[])
  into normalized_completion_ids
  from unnest(coalesce(completion_jamaah_ids, '{}'::uuid[])) as selected(jamaah_id);

  if target_material_type not in ('hasda', 'asad')
     and cardinality(normalized_completion_ids) > 0 then
    raise exception 'Materi reguler tidak dapat menghasilkan ketuntasan bulanan.' using errcode = '22023';
  end if;

  requested_completion_count := cardinality(normalized_completion_ids);
  select count(*) into valid_completion_count
  from public.attendance_records record
  where record.session_id = resolved_session_id
    and record.status = 'present'
    and record.jamaah_id = any(normalized_completion_ids);

  if valid_completion_count <> requested_completion_count then
    raise exception 'Ketuntasan hanya dapat diberikan kepada peserta yang hadir.' using errcode = '22023';
  end if;

  -- Seluruh sinkronisasi ketuntasan berada pada transaksi yang sama dengan absensi.
  delete from public.material_completions
  where source_session_id = resolved_session_id
    and source = 'main_session';

  if target_material_type in ('hasda', 'asad') then
    insert into public.material_completions (
      month,
      material_type,
      jamaah_id,
      class_id,
      source,
      completed_on,
      source_session_id,
      recorded_by
    )
    select
      to_char(session_date, 'YYYY-MM'),
      target_material_type,
      selected.jamaah_id,
      target_class_id,
      'main_session',
      session_date,
      resolved_session_id,
      auth.uid()
    from unnest(normalized_completion_ids) as selected(jamaah_id)
    on conflict (month, material_type, jamaah_id) do update set
      class_id = excluded.class_id,
      source = 'main_session',
      completed_on = excluded.completed_on,
      source_session_id = excluded.source_session_id,
      recorded_by = excluded.recorded_by;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', completion.id,
      'month', completion.month,
      'materialType', completion.material_type,
      'jamaahId', completion.jamaah_id,
      'classId', completion.class_id,
      'source', completion.source,
      'completedOn', completion.completed_on,
      'sourceSessionId', completion.source_session_id
    ) order by completion.jamaah_id),
    '[]'::jsonb
  )
  into completion_rows
  from public.material_completions completion
  where completion.source_session_id = resolved_session_id
    and completion.source = 'main_session';

  return session_result || jsonb_build_object('completions', completion_rows);
end;
$$;

revoke all on function public.save_attendance_session_safe(uuid,date,uuid,public.material_type,text,text,timestamptz,integer,jsonb) from authenticated;
revoke all on function public.save_attendance_session_complete(uuid,date,uuid,public.material_type,text,text,timestamptz,integer,jsonb,uuid[]) from public;
grant execute on function public.save_attendance_session_complete(uuid,date,uuid,public.material_type,text,text,timestamptz,integer,jsonb,uuid[]) to authenticated;

-- Ketuntasan sesi utama hanya boleh dikelola oleh RPC transaksional di atas.
drop policy if exists "material completion inserted within access" on public.material_completions;
create policy "material completion inserted within access"
on public.material_completions for insert to authenticated
with check (
  source = 'follow_up'
  and (
    public.is_superadmin()
    or (
      class_id is not null
      and public.can_manage_class(class_id)
      and public.jamaah_in_managed_class(jamaah_id)
    )
  )
);

drop policy if exists "material completion updated within access" on public.material_completions;
create policy "material completion updated within access"
on public.material_completions for update to authenticated
using (
  source = 'follow_up'
  and (
    public.is_superadmin()
    or (class_id is not null and public.can_manage_class(class_id))
  )
)
with check (
  source = 'follow_up'
  and (
    public.is_superadmin()
    or (
      class_id is not null
      and public.can_manage_class(class_id)
      and public.jamaah_in_managed_class(jamaah_id)
    )
  )
);

drop policy if exists "material completion deleted within access" on public.material_completions;
create policy "material completion deleted within access"
on public.material_completions for delete to authenticated
using (
  source = 'follow_up'
  and (
    public.is_superadmin()
    or (class_id is not null and public.can_manage_class(class_id))
  )
);


create or replace function public.prevent_future_effective_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.effective_date > current_date then
    raise exception 'Tanggal efektif tidak boleh berada di masa depan.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists class_history_future_date_guard on public.class_membership_history;
create trigger class_history_future_date_guard
before insert or update on public.class_membership_history
for each row execute function public.prevent_future_effective_date();

drop trigger if exists status_history_future_date_guard on public.jamaah_status_history;
create trigger status_history_future_date_guard
before insert or update on public.jamaah_status_history
for each row execute function public.prevent_future_effective_date();
