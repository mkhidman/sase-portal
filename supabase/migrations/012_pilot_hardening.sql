-- Fase 11: pilot & hardening.
-- Menambahkan optimistic locking dan penyimpanan absensi transaksional.

alter table public.attendance_sessions
  add column if not exists revision integer not null default 1;

create index if not exists attendance_sessions_revision_idx
  on public.attendance_sessions(id, revision);

comment on column public.attendance_sessions.revision is
  'Versi perubahan untuk mencegah dua Admin saling menimpa absensi yang sama.';


create or replace function public.jamaah_in_managed_attendance_history(target_jamaah_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin() or exists (
    select 1
    from public.attendance_records ar
    join public.attendance_sessions s on s.id = ar.session_id
    where ar.jamaah_id = target_jamaah_id
      and public.can_manage_class(s.class_id)
  );
$$;

grant execute on function public.jamaah_in_managed_attendance_history(uuid) to authenticated;

drop policy if exists "jamaah read within access" on public.jamaah;
create policy "jamaah read within access"
on public.jamaah for select to authenticated
using (
  public.is_superadmin()
  or public.jamaah_in_managed_class(id)
  or public.jamaah_in_managed_attendance_history(id)
);

create or replace function public.save_attendance_session_safe(
  target_session_id uuid,
  session_date date,
  target_class_id uuid,
  target_material_type public.material_type,
  target_material_name text,
  session_notes text,
  session_saved_at timestamptz,
  expected_revision integer,
  record_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_session public.attendance_sessions%rowtype;
  resolved_session_id uuid;
  next_revision integer;
  record_item jsonb;
begin
  if auth.uid() is null then
    raise exception 'Pengguna belum terautentikasi.' using errcode = '42501';
  end if;

  if not public.can_manage_class(target_class_id) then
    raise exception 'Anda tidak memiliki akses ke kelas ini.' using errcode = '42501';
  end if;

  if public.is_reporting_period_closed(to_char(session_date, 'YYYY-MM')) then
    raise exception 'Periode % sudah ditutup dan tidak dapat diubah.', to_char(session_date, 'YYYY-MM') using errcode = 'P0001';
  end if;

  select * into current_session
  from public.attendance_sessions
  where id = target_session_id
     or (
       date = session_date
       and class_id = target_class_id
       and material_type = target_material_type
       and material_name = coalesce(target_material_name, '')
     )
  order by case when id = target_session_id then 0 else 1 end
  limit 1
  for update;

  if found then
    if current_session.revision <> coalesce(expected_revision, 0) then
      raise exception 'ATTENDANCE_CONFLICT: expected %, current %', expected_revision, current_session.revision
        using errcode = 'P0001';
    end if;

    resolved_session_id := current_session.id;
    next_revision := current_session.revision + 1;

    update public.attendance_sessions
    set date = session_date,
        class_id = target_class_id,
        material_type = target_material_type,
        material_name = coalesce(target_material_name, ''),
        notes = nullif(trim(session_notes), ''),
        saved_at = coalesce(session_saved_at, now()),
        revision = next_revision
    where id = resolved_session_id;
  else
    if coalesce(expected_revision, 0) <> 0 then
      raise exception 'ATTENDANCE_CONFLICT: session no longer exists' using errcode = 'P0001';
    end if;

    resolved_session_id := target_session_id;
    next_revision := 1;

    insert into public.attendance_sessions (
      id, date, class_id, material_type, material_name, notes, saved_at, revision, created_by
    ) values (
      resolved_session_id,
      session_date,
      target_class_id,
      target_material_type,
      coalesce(target_material_name, ''),
      nullif(trim(session_notes), ''),
      coalesce(session_saved_at, now()),
      next_revision,
      auth.uid()
    );
  end if;

  if jsonb_typeof(coalesce(record_items, '[]'::jsonb)) = 'array' then
    -- Validasi dilakukan sebelum data lama dihapus. Jamaah yang sudah pindah/diarsipkan
    -- tetap boleh dipertahankan ketika mengedit sesi historis yang sebelumnya mencatatnya.
    for record_item in select value from jsonb_array_elements(coalesce(record_items, '[]'::jsonb))
    loop
      if not exists (
        select 1 from public.jamaah_classes
        where jamaah_id = (record_item ->> 'jamaahId')::uuid
          and class_id = target_class_id
      ) and not exists (
        select 1 from public.attendance_records
        where session_id = resolved_session_id
          and jamaah_id = (record_item ->> 'jamaahId')::uuid
      ) then
        raise exception 'Jamaah tidak terdaftar pada kelas sesi ini.' using errcode = 'P0001';
      end if;
    end loop;
  end if;

  delete from public.attendance_records where session_id = resolved_session_id;

  if jsonb_typeof(coalesce(record_items, '[]'::jsonb)) = 'array' then
    for record_item in select value from jsonb_array_elements(coalesce(record_items, '[]'::jsonb))
    loop
      insert into public.attendance_records (session_id, jamaah_id, status)
      values (
        resolved_session_id,
        (record_item ->> 'jamaahId')::uuid,
        (record_item ->> 'status')::public.attendance_status
      );
    end loop;
  end if;

  return jsonb_build_object(
    'id', resolved_session_id,
    'revision', next_revision,
    'savedAt', coalesce(session_saved_at, now())
  );
end;
$$;

revoke all on function public.save_attendance_session_safe(uuid,date,uuid,public.material_type,text,text,timestamptz,integer,jsonb) from public;
grant execute on function public.save_attendance_session_safe(uuid,date,uuid,public.material_type,text,text,timestamptz,integer,jsonb) to authenticated;
