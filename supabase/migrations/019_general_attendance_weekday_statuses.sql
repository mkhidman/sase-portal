-- Batasi rekap turunan Pengajian Umum pada hari Senin/Rabu dan salin
-- seluruh status Hadir, Izin, Sakit, serta Alpa untuk setiap kelompok.

comment on column public.attendance_sessions.generated_from_session_id is
  'Sesi Pengajian Umum hari Senin/Rabu yang menghasilkan rekap status lengkap per kelompok. NULL untuk sesi yang diinput langsung.';

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

  -- Hapus hasil sinkronisasi sebelumnya lebih dulu. Dengan begitu, mengubah
  -- tanggal sesi dari Senin/Rabu ke hari lain juga membersihkan rekap turunannya.
  delete from public.attendance_sessions
  where generated_from_session_id = parent_session.id;

  if extract(isodow from parent_session.date) not in (1, 3) then
    return;
  end if;

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
    select child_session_id, record.jamaah_id, record.status
    from public.attendance_records record
    join public.jamaah person on person.id = record.jamaah_id
    where record.session_id = parent_session.id
      and person.census_category = target.census_category;
  end loop;
end;
$$;

revoke all on function public.sync_general_attendance_breakdown(uuid) from public;
revoke all on function public.sync_general_attendance_breakdown(uuid) from authenticated;

-- Terapkan aturan baru juga pada data yang sudah sempat dibuat oleh migration
-- sebelumnya: Senin/Rabu disinkronkan ulang dengan status lengkap, sedangkan
-- rekap otomatis pada hari lain dibersihkan.
do $$
declare
  source_session record;
begin
  for source_session in
    select session.id
    from public.attendance_sessions session
    join public.study_classes study_class on study_class.id = session.class_id
    where study_class.name = 'Pengajian Umum'
      and session.generated_from_session_id is null
  loop
    perform public.sync_general_attendance_breakdown(source_session.id);
  end loop;
end;
$$;
