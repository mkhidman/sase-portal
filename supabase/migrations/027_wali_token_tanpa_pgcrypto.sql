-- Perbaikan migration 026: set_wali_access gagal dengan 42883
-- "function gen_random_bytes(integer) does not exist".
--
-- pgcrypto memang aktif, tetapi Supabase memasangnya di schema `extensions`,
-- sementara fungsi ini memakai `set search_path = public` demi keamanan.
-- gen_random_uuid() di migration 001 lolos karena itu fungsi bawaan inti
-- Postgres (pg_catalog), bukan milik pgcrypto.
--
-- Tokennya kini disusun dari dua gen_random_uuid(). Keduanya memakai pembangkit
-- acak kuat bawaan Postgres, hasilnya 64 digit heksadesimal (~244 bit) dan sudah
-- aman untuk URL tanpa perlu dibersihkan. Memilih ini daripada menambahkan
-- `extensions` ke search_path supaya tidak ada asumsi tentang di schema mana
-- sebuah ekstensi kebetulan dipasang.

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

  -- Token baru tiap kali diaktifkan, jadi mengaktifkan ulang sekaligus mencabut
  -- tautan yang sudah terlanjur tersebar.
  new_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

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
