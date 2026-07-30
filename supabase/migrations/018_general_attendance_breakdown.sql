-- Rekap turunan Pengajian Umum untuk Pra Remaja, Remaja, dan Pra Nikah.
-- Hanya peserta berstatus hadir yang disalin agar sesi turunan tidak membuat
-- catatan alpa palsu. Sesi sumber Pengajian Umum tetap menyimpan status lengkap.

alter table public.attendance_sessions
  add column if not exists generated_from_session_id uuid
  references public.attendance_sessions(id) on delete cascade;

create index if not exists attendance_sessions_generated_from_idx
  on public.attendance_sessions(generated_from_session_id)
  where generated_from_session_id is not null;

comment on column public.attendance_sessions.generated_from_session_id is
  'Sesi Pengajian Umum yang menghasilkan rekap hadir per kelompok. NULL untuk sesi yang diinput langsung.';

create or replace function public.sync_general_attendance_breakdown(parent_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_session public.attendance_sessions%rowtype;
  target record;
  child_session_id uuid;
  child_material_name text;
begin
  select session.*
  into parent_session
  from public.attendance_sessions session
  join public.study_classes study_class on study_class.id = session.class_id
  where session.id = parent_session_id
    and study_class.name = 'Pengajian Umum'
    and session.generated_from_session_id is null;

  if not found then
    return;
  end if;

  -- Sinkronisasi ulang selalu mengganti seluruh rekap turunan dalam transaksi
  -- yang sama, termasuk menghapus kelompok yang sudah tidak memiliki peserta hadir.
  delete from public.attendance_sessions
  where generated_from_session_id = parent_session.id;

  child_material_name := case
    when nullif(trim(parent_session.material_name), '') is null then '[Pengajian Umum]'
    else '[Pengajian Umum] ' || trim(parent_session.material_name)
  end;

  for target in
    select study_class.id as class_id, mapping.census_category
    from (
      values
        ('Pra Remaja'::text, 'Pra Remaja'::text),
        ('Remaja'::text, 'Remaja'::text),
        ('Pra Nikah'::text, 'Usia Nikah'::text)
    ) as mapping(class_name, census_category)
    join public.study_classes study_class
      on study_class.name = mapping.class_name
     and study_class.active = true
    where exists (
      select 1
      from public.attendance_records record
      join public.jamaah person on person.id = record.jamaah_id
      where record.session_id = parent_session.id
        and record.status = 'present'
        and person.census_category = mapping.census_category
    )
  loop
    child_session_id := gen_random_uuid();

    insert into public.attendance_sessions (
      id,
      date,
      class_id,
      material_type,
      material_name,
      notes,
      saved_at,
      revision,
      created_by,
      generated_from_session_id
    ) values (
      child_session_id,
      parent_session.date,
      target.class_id,
      parent_session.material_type,
      child_material_name,
      parent_session.notes,
      parent_session.saved_at,
      1,
      auth.uid(),
      parent_session.id
    );

    insert into public.attendance_records (session_id, jamaah_id, status)
    select child_session_id, record.jamaah_id, 'present'::public.attendance_status
    from public.attendance_records record
    join public.jamaah person on person.id = record.jamaah_id
    where record.session_id = parent_session.id
      and record.status = 'present'
      and person.census_category = target.census_category;
  end loop;
end;
$$;

revoke all on function public.sync_general_attendance_breakdown(uuid) from public;
revoke all on function public.sync_general_attendance_breakdown(uuid) from authenticated;

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

  perform public.sync_general_attendance_breakdown(resolved_session_id);

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

revoke all on function public.save_attendance_session_complete(uuid,date,uuid,public.material_type,text,text,timestamptz,integer,jsonb,uuid[]) from public;
grant execute on function public.save_attendance_session_complete(uuid,date,uuid,public.material_type,text,text,timestamptz,integer,jsonb,uuid[]) to authenticated;
