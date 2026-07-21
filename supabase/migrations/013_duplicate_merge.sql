-- Fase 12: penggabungan data jamaah duplikat secara transaksional.
-- Jalankan setelah migration 012_pilot_hardening.sql.

create table if not exists public.jamaah_merge_history (
  id uuid primary key default gen_random_uuid(),
  primary_jamaah_id uuid references public.jamaah(id) on delete set null,
  duplicate_jamaah_id uuid not null,
  primary_name text not null,
  duplicate_name text not null,
  merged_profile jsonb not null default '{}'::jsonb,
  duplicate_snapshot jsonb not null default '{}'::jsonb,
  moved_counts jsonb not null default '{}'::jsonb,
  family_conflict boolean not null default false,
  merged_by uuid references public.profiles(id) on delete set null,
  merged_at timestamptz not null default now()
);

create index if not exists jamaah_merge_history_merged_at_idx
  on public.jamaah_merge_history(merged_at desc);
create index if not exists jamaah_merge_history_primary_idx
  on public.jamaah_merge_history(primary_jamaah_id, merged_at desc);

alter table public.jamaah_merge_history enable row level security;

drop policy if exists "merge history managed by superadmin" on public.jamaah_merge_history;
create policy "merge history managed by superadmin"
on public.jamaah_merge_history for select to authenticated
using (public.is_superadmin());

grant select on public.jamaah_merge_history to authenticated;

-- Penggabungan merupakan koreksi identitas, sehingga boleh memindahkan referensi
-- historis dari periode tertutup tanpa mengubah tanggal/status sesi tersebut.
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
  if current_setting('app.allow_duplicate_merge', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

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

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.merge_jamaah_duplicates(
  primary_id uuid,
  duplicate_id uuid,
  merged_values jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  primary_row public.jamaah%rowtype;
  duplicate_row public.jamaah%rowtype;
  merge_id uuid;
  target_family_id uuid;
  source_family_id uuid;
  target_has_primary_guardian boolean;
  family_conflict_value boolean := false;
  attendance_count integer := 0;
  completion_count integer := 0;
  follow_up_count integer := 0;
  guardian_count integer := 0;
  class_count integer := 0;
  class_history_count integer := 0;
  status_history_count integer := 0;
  merged_name text;
  merged_gender public.gender_type;
  merged_birth_date date;
  merged_phone text;
  merged_category text;
  merged_active boolean;
  snapshot jsonb;
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat menggabungkan data jamaah.' using errcode = '42501';
  end if;
  if primary_id = duplicate_id then
    raise exception 'Data utama dan data duplikat harus berbeda.' using errcode = '22023';
  end if;

  select * into primary_row from public.jamaah where id = primary_id for update;
  select * into duplicate_row from public.jamaah where id = duplicate_id for update;
  if primary_row.id is null or duplicate_row.id is null then
    raise exception 'Salah satu data jamaah tidak ditemukan.' using errcode = 'P0002';
  end if;

  merged_name := trim(coalesce(merged_values ->> 'fullName', primary_row.full_name));
  merged_gender := coalesce(nullif(merged_values ->> 'gender', '')::public.gender_type, primary_row.gender);
  merged_birth_date := nullif(merged_values ->> 'birthDate', '')::date;
  merged_phone := nullif(trim(coalesce(merged_values ->> 'phone', primary_row.phone, '')), '');
  merged_category := coalesce(nullif(merged_values ->> 'censusCategory', ''), primary_row.census_category);
  merged_active := primary_row.active or duplicate_row.active;

  if merged_name = '' then raise exception 'Nama hasil penggabungan wajib diisi.' using errcode = '22023'; end if;
  if merged_category not in ('Balita','Caberawit','Pra Remaja','Remaja','Usia Nikah','Menikah','Duda & Janda') then
    raise exception 'Kategori sensus hasil penggabungan tidak valid.' using errcode = '22023';
  end if;

  select family_id into target_family_id from public.family_members where jamaah_id = primary_id;
  select family_id into source_family_id from public.family_members where jamaah_id = duplicate_id;

  snapshot := to_jsonb(duplicate_row) || jsonb_build_object(
    'classIds', coalesce((select jsonb_agg(class_id) from public.jamaah_classes where jamaah_id = duplicate_id), '[]'::jsonb),
    'familyId', source_family_id,
    'guardianContacts', coalesce((select jsonb_agg(to_jsonb(gc)) from public.guardian_contacts gc where jamaah_id = duplicate_id), '[]'::jsonb)
  );

  perform set_config('app.allow_duplicate_merge', 'on', true);
  perform set_config('app.allow_jamaah_status_change', 'on', true);

  update public.jamaah
  set full_name = merged_name,
      gender = merged_gender,
      birth_date = merged_birth_date,
      phone = merged_phone,
      census_category = merged_category,
      active = merged_active
  where id = primary_id;

  insert into public.jamaah_classes (jamaah_id, class_id)
  select primary_id, class_id from public.jamaah_classes where jamaah_id = duplicate_id
  on conflict (jamaah_id, class_id) do nothing;
  get diagnostics class_count = row_count;

  -- Jika kedua identitas tercatat pada sesi yang sama, pertahankan status terbaik:
  -- Hadir > Sakit > Izin > Alpa.
  insert into public.attendance_records (session_id, jamaah_id, status, updated_at)
  select session_id, primary_id, status, updated_at
  from public.attendance_records where jamaah_id = duplicate_id
  on conflict (session_id, jamaah_id) do update set
    status = case greatest(
      case public.attendance_records.status when 'present' then 4 when 'sick' then 3 when 'excused' then 2 else 1 end,
      case excluded.status when 'present' then 4 when 'sick' then 3 when 'excused' then 2 else 1 end
    ) when 4 then 'present'::public.attendance_status
      when 3 then 'sick'::public.attendance_status
      when 2 then 'excused'::public.attendance_status
      else 'absent'::public.attendance_status end,
    updated_at = greatest(public.attendance_records.updated_at, excluded.updated_at);
  get diagnostics attendance_count = row_count;
  delete from public.attendance_records where jamaah_id = duplicate_id;

  -- Gabungkan ketuntasan yang memiliki kunci bulan+materi sama.
  update public.material_completions target
  set source = case when target.source = 'follow_up' and source.source = 'main_session' then source.source else target.source end,
      class_id = coalesce(target.class_id, source.class_id),
      completed_on = least(target.completed_on, source.completed_on),
      source_session_id = case when target.source = 'follow_up' and source.source = 'main_session' then source.source_session_id else target.source_session_id end
  from public.material_completions source
  where target.jamaah_id = primary_id
    and source.jamaah_id = duplicate_id
    and target.month = source.month
    and target.material_type = source.material_type;

  update public.material_completions source
  set jamaah_id = primary_id
  where source.jamaah_id = duplicate_id
    and not exists (
      select 1 from public.material_completions target
      where target.jamaah_id = primary_id
        and target.month = source.month
        and target.material_type = source.material_type
    );
  get diagnostics completion_count = row_count;
  delete from public.material_completions where jamaah_id = duplicate_id;

  -- Pertahankan tindak lanjut yang paling membutuhkan perhatian saat terjadi konflik.
  update public.jamaah_follow_ups target
  set status = case greatest(
        case target.status when 'visit_needed' then 4 when 'pending' then 3 when 'contacted' then 2 else 1 end,
        case source.status when 'visit_needed' then 4 when 'pending' then 3 when 'contacted' then 2 else 1 end
      ) when 4 then 'visit_needed' when 3 then 'pending' when 2 then 'contacted' else 'resolved' end,
      attendance_rate = least(target.attendance_rate, source.attendance_rate),
      absence_count = greatest(target.absence_count, source.absence_count),
      consecutive_absence = greatest(target.consecutive_absence, source.consecutive_absence),
      notes = nullif(concat_ws(E'\n', nullif(target.notes, ''), nullif(source.notes, '')), ''),
      next_follow_up_date = coalesce(target.next_follow_up_date, source.next_follow_up_date),
      updated_at = greatest(target.updated_at, source.updated_at)
  from public.jamaah_follow_ups source
  where target.jamaah_id = primary_id
    and source.jamaah_id = duplicate_id
    and target.class_id = source.class_id
    and target.period_month = source.period_month;

  update public.jamaah_follow_ups source
  set jamaah_id = primary_id
  where source.jamaah_id = duplicate_id
    and not exists (
      select 1 from public.jamaah_follow_ups target
      where target.jamaah_id = primary_id
        and target.class_id = source.class_id
        and target.period_month = source.period_month
    );
  get diagnostics follow_up_count = row_count;
  delete from public.jamaah_follow_ups where jamaah_id = duplicate_id;

  update public.class_membership_history set jamaah_id = primary_id where jamaah_id = duplicate_id;
  get diagnostics class_history_count = row_count;
  update public.jamaah_status_history set jamaah_id = primary_id where jamaah_id = duplicate_id;
  get diagnostics status_history_count = row_count;

  -- Keluarga: bila data utama belum punya keluarga, gunakan keluarga duplikat.
  -- Bila keduanya berbeda, keluarga data utama dipertahankan dan konflik dicatat di histori merge.
  if source_family_id is not null then
    if target_family_id is null then
      update public.family_members set jamaah_id = primary_id where jamaah_id = duplicate_id;
    elsif target_family_id = source_family_id then
      delete from public.family_members where jamaah_id = duplicate_id;
    else
      family_conflict_value := true;
      delete from public.family_members where jamaah_id = duplicate_id;
    end if;
  end if;
  delete from public.families family
  where family.id = source_family_id
    and not exists (select 1 from public.family_members member where member.family_id = family.id);

  -- Hindari kontak wali identik, lalu pindahkan sisanya.
  delete from public.guardian_contacts source
  where source.jamaah_id = duplicate_id
    and exists (
      select 1 from public.guardian_contacts target
      where target.jamaah_id = primary_id
        and regexp_replace(target.phone, E'\\D', '', 'g') = regexp_replace(source.phone, E'\\D', '', 'g')
        and lower(trim(target.full_name)) = lower(trim(source.full_name))
    );
  select exists(select 1 from public.guardian_contacts where jamaah_id = primary_id and is_primary) into target_has_primary_guardian;
  if target_has_primary_guardian then
    update public.guardian_contacts set is_primary = false where jamaah_id = duplicate_id and is_primary;
  end if;
  update public.guardian_contacts set jamaah_id = primary_id where jamaah_id = duplicate_id;
  get diagnostics guardian_count = row_count;

  insert into public.jamaah_merge_history (
    primary_jamaah_id, duplicate_jamaah_id, primary_name, duplicate_name,
    merged_profile, duplicate_snapshot, moved_counts, family_conflict, merged_by
  ) values (
    primary_id, duplicate_id, primary_row.full_name, duplicate_row.full_name,
    jsonb_build_object('fullName', merged_name, 'gender', merged_gender, 'birthDate', merged_birth_date, 'phone', merged_phone, 'censusCategory', merged_category, 'active', merged_active),
    snapshot,
    jsonb_build_object('classes', class_count, 'attendance', attendance_count, 'materials', completion_count, 'followUps', follow_up_count, 'guardians', guardian_count, 'classHistory', class_history_count, 'statusHistory', status_history_count),
    family_conflict_value,
    auth.uid()
  ) returning id into merge_id;

  delete from public.jamaah where id = duplicate_id;

  if to_regclass('public.audit_logs') is not null then
    insert into public.audit_logs (actor_id, actor_name, actor_email, action, entity_type, entity_id, summary, metadata)
    select auth.uid(), coalesce(p.full_name, 'Sistem'), coalesce(p.email, ''), 'update', 'jamaah_merge', merge_id::text,
      'Menggabungkan data ' || duplicate_row.full_name || ' ke ' || merged_name,
      jsonb_build_object('primaryJamaahId', primary_id, 'duplicateJamaahId', duplicate_id, 'familyConflict', family_conflict_value)
    from public.profiles p where p.id = auth.uid();
  end if;

  return jsonb_build_object(
    'mergeId', merge_id,
    'primaryJamaahId', primary_id,
    'duplicateJamaahId', duplicate_id,
    'familyConflict', family_conflict_value
  );
end;
$$;

revoke all on function public.merge_jamaah_duplicates(uuid,uuid,jsonb) from public;
grant execute on function public.merge_jamaah_duplicates(uuid,uuid,jsonb) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.jamaah_merge_history;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
