-- Rentang absensi yang dilihat wali, per tautan. Sebelumnya dipaku tiga bulan terakhir
-- di dua tempat: WALI_WINDOW_MONTHS di src/lib/wali.ts dan wali_attendance di 026.
--
-- Rentang disimpan sebagai pilihan, bukan sepasang tanggal, supaya "Bulan lalu" ikut
-- berjalan tiap bulan tanpa ada yang perlu memperbaruinya. Hanya 'custom' yang memaku
-- bulannya. Bawaannya '3-bulan', jadi tautan yang sudah tersebar tidak berubah isinya.

alter table public.wali_access
  add column if not exists window_preset text not null default '3-bulan',
  add column if not exists from_month text,
  add column if not exists to_month text;

-- Pembatas yang sama dengan waliWindowRange() di frontend: 'custom' wajib lengkap dan urut,
-- pilihan lain tidak boleh menyimpan bulan sisa yang nanti terbaca sebagai rentang paku.
alter table public.wali_access drop constraint if exists wali_access_window_valid;
alter table public.wali_access add constraint wali_access_window_valid check (
  window_preset in ('bulan-ini', 'bulan-lalu', '3-bulan', '6-bulan', 'custom')
  and case
    when window_preset = 'custom' then
      from_month ~ '^\d{4}-\d{2}$' and to_month ~ '^\d{4}-\d{2}$' and from_month <= to_month
    else from_month is null and to_month is null
  end
);

-- Mengubah rentang sengaja tidak memutar token: tautan yang sudah dikirim ke orang tua
-- tetap berlaku, kalau tidak setiap penyesuaian periode memaksa kirim ulang satu per satu.
create or replace function public.set_wali_window(
  target_jamaah_id uuid,
  new_preset text,
  new_from_month text default null,
  new_to_month text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat mengatur akses wali.' using errcode = '42501';
  end if;

  if new_preset not in ('bulan-ini', 'bulan-lalu', '3-bulan', '6-bulan', 'custom') then
    raise exception 'Pilihan rentang tidak dikenal.' using errcode = '22023';
  end if;

  if new_preset = 'custom' and (new_from_month is null or new_to_month is null) then
    raise exception 'Rentang sendiri butuh bulan awal dan bulan akhir.' using errcode = '22023';
  end if;

  update public.wali_access
  set window_preset = new_preset,
      -- least/greatest membetulkan rentang terbalik, sama seperti waliWindowRange().
      from_month = case when new_preset = 'custom' then least(new_from_month, new_to_month) end,
      to_month = case when new_preset = 'custom' then greatest(new_from_month, new_to_month) end
  where jamaah_id = target_jamaah_id;

  if not found then
    raise exception 'Warga ini belum punya tautan wali yang aktif.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_wali_window(uuid, text, text, text) from public;
grant execute on function public.set_wali_window(uuid, text, text, text) to authenticated;

-- Satu-satunya pintu untuk pengunjung tanpa akun. Batasnya kini dari baris wali_access,
-- bukan angka tetap, dan selalu bulan penuh supaya bulan tertua tidak tampil separuh.
create or replace function public.wali_attendance(access_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  guardian_id uuid;
  guardian_name text;
  preset text;
  -- Nama sengaja beda dari nama kolomnya: variabel plpgsql yang senama membuat
  -- referensi tanpa alias jadi ambigu dan fungsinya gagal saat dijalankan.
  from_m text;
  to_m text;
  window_start date;
  window_end date;
  result json;
begin
  if access_token is null or length(access_token) < 16 then
    return null;
  end if;

  select akses.jamaah_id, person.full_name, akses.window_preset, akses.from_month, akses.to_month
  into guardian_id, guardian_name, preset, from_m, to_m
  from public.wali_access akses
  join public.jamaah person on person.id = akses.jamaah_id
  where akses.token = access_token;

  if guardian_id is null then
    return null;
  end if;

  -- Cerminan waliWindowRange() di src/lib/wali.ts. Mengubah salah satunya saja membuat
  -- halaman wali dan jalur demo menampilkan periode yang berbeda.
  if preset = 'bulan-ini' then
    window_start := date_trunc('month', current_date)::date;
    window_end := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  elsif preset = 'bulan-lalu' then
    window_start := date_trunc('month', current_date - interval '1 month')::date;
    window_end := (date_trunc('month', current_date) - interval '1 day')::date;
  elsif preset = '6-bulan' then
    window_start := date_trunc('month', current_date - interval '5 months')::date;
    window_end := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  elsif preset = 'custom' and from_m is not null and to_m is not null then
    window_start := to_date(from_m || '-01', 'YYYY-MM-DD');
    window_end := (to_date(to_m || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  else
    -- '3-bulan', rentang custom yang separuh terisi, dan nilai tak dikenal: tiga bulan kalender terakhir.
    window_start := date_trunc('month', current_date - interval '2 months')::date;
    window_end := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
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
      and sesi.date <= window_end
    group by absen.jamaah_id
  )
  select json_build_object(
    'wali', guardian_name,
    'sejak', window_start,
    'sampai', window_end,
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
