-- Akses wali: orang tua membuka absensi tanggungannya lewat tautan rahasia, tanpa akun.
--
-- Token sengaja ditaruh di tabel terpisah, bukan sebagai kolom di public.jamaah.
-- Pemicu audit pada 013 menyimpan to_jsonb(new) seluruh baris, dan merge_jamaah_duplicates
-- menyimpan select * sebagai duplicate_snapshot; kolom baru di jamaah berarti token ikut
-- mendarat di audit_logs dan riwayat penggabungan yang bisa diunduh admin.
--
-- Tabel ini juga sengaja tidak didaftarkan ke publication supabase_realtime: tidak ada
-- klien yang berlangganan, dan menyiarkan baris berisi token tidak ada gunanya.

create table if not exists public.wali_access (
  jamaah_id uuid primary key references public.jamaah(id) on delete cascade,
  token text not null unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.wali_access enable row level security;

drop policy if exists "wali access read by superadmin" on public.wali_access;
create policy "wali access read by superadmin" on public.wali_access for select to authenticated
  using (public.is_superadmin());

-- Tidak ada policy tulis: seluruh perubahan lewat set_wali_access di bawah.

create or replace function public.set_wali_access(target_jamaah_id uuid, enable boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token text;
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat mengatur akses wali.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.jamaah where id = target_jamaah_id) then
    raise exception 'Data warga tidak ditemukan.' using errcode = 'P0002';
  end if;

  if not enable then
    delete from public.wali_access where jamaah_id = target_jamaah_id;
    return null;
  end if;

  if not exists (
    select 1 from public.guardian_contacts
    where guardian_jamaah_id = target_jamaah_id and jamaah_id <> target_jamaah_id
  ) then
    raise exception 'Warga ini belum tercatat sebagai wali siapa pun.' using errcode = '22023';
  end if;

  -- base64 dibersihkan jadi aman untuk URL. Token baru tiap kali diaktifkan,
  -- jadi mengaktifkan ulang sekaligus mencabut tautan yang sudah terlanjur tersebar.
  new_token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');

  insert into public.wali_access (jamaah_id, token, created_by)
  values (target_jamaah_id, new_token, auth.uid())
  on conflict (jamaah_id) do update
    set token = excluded.token,
        created_by = excluded.created_by,
        created_at = now();

  return new_token;
end;
$$;

revoke all on function public.set_wali_access(uuid, boolean) from public;
grant execute on function public.set_wali_access(uuid, boolean) to authenticated;

-- Satu-satunya pintu untuk pengunjung tanpa akun. Dibatasi 3 bulan terakhir supaya
-- halamannya terbaca; orang tua tidak butuh daftar dua tahun.
create or replace function public.wali_attendance(access_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  guardian_id uuid;
  guardian_name text;
  window_start date := (current_date - interval '3 months')::date;
  result json;
begin
  if access_token is null or length(access_token) < 16 then
    return null;
  end if;

  select akses.jamaah_id, person.full_name
  into guardian_id, guardian_name
  from public.wali_access akses
  join public.jamaah person on person.id = akses.jamaah_id
  where akses.token = access_token;

  if guardian_id is null then
    return null;
  end if;

  with tanggungan as (
    select person.id, person.full_name, 0 as urutan
    from public.jamaah person
    where person.id = guardian_id
    union
    select person.id, person.full_name, 1 as urutan
    from public.jamaah person
    join public.guardian_contacts contact on contact.jamaah_id = person.id
    where contact.guardian_jamaah_id = guardian_id
      and person.id <> guardian_id
      and person.active
  ),
  kelas as (
    select member.jamaah_id,
           string_agg(study.name, ', ' order by study.sort_order, study.id) as nama_kelas
    from public.jamaah_classes member
    join public.study_classes study on study.id = member.class_id
    where member.jamaah_id in (select id from tanggungan)
    group by member.jamaah_id
  ),
  absensi as (
    select absen.jamaah_id,
           json_agg(json_build_object(
             'tanggal', sesi.date,
             'materiTipe', sesi.material_type,
             'materiNama', coalesce(sesi.material_name, ''),
             'status', absen.status
           ) order by sesi.date desc) as daftar
    from public.attendance_records absen
    join public.attendance_sessions sesi on sesi.id = absen.session_id
    where absen.jamaah_id in (select id from tanggungan)
      and sesi.date >= window_start
    group by absen.jamaah_id
  )
  select json_build_object(
    'wali', guardian_name,
    'sejak', window_start,
    'anggota', coalesce(json_agg(json_build_object(
      'nama', orang.full_name,
      'kelas', coalesce(kelas.nama_kelas, ''),
      'absensi', coalesce(absensi.daftar, '[]'::json)
    ) order by orang.urutan, orang.full_name), '[]'::json)
  )
  into result
  from tanggungan orang
  left join kelas on kelas.jamaah_id = orang.id
  left join absensi on absensi.jamaah_id = orang.id;

  return result;
end;
$$;

revoke all on function public.wali_attendance(text) from public;
grant execute on function public.wali_attendance(text) to anon, authenticated;
