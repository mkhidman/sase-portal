-- Tautan publik Laporan Pencapaian KBM: orang tua membukanya tanpa akun.
--
-- Yang disimpan adalah HASIL laporan bulan itu, bukan izin membaca tabel.
-- Dua sebabnya:
--
-- 1. Aturan perhitungannya -- penyebut memakai sesi yang namanya tercatat, dan
--    keanggotaan kelas diputar mundur ke akhir bulan -- hidup di src/lib. Kalau
--    tautan ini membaca tabel langsung, aturan yang sama harus ditulis ulang
--    dalam SQL, dan dua salinan aturan itu pasti berbeda suatu saat tanpa ada
--    yang menangkapnya.
-- 2. Laporan ini dibacakan dalam pertemuan bulanan. Angka yang sudah dibagikan
--    ke orang tua tidak boleh berubah sendiri ketika absensi bulan itu
--    dikoreksi kemudian. Menerbitkan ulang adalah tindakan sadar.
--
-- Isinya hanya nama generus dan persentase kehadirannya -- tidak ada nomor
-- telepon, alamat, atau tanggal lahir. Tabel ini juga sengaja tidak
-- didaftarkan ke publication supabase_realtime: tidak ada klien yang
-- berlangganan, dan menyiarkan baris berisi token tidak ada gunanya.

create table if not exists public.kbm_report_links (
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  token text not null unique,
  payload jsonb not null,
  published_by uuid references public.profiles(id),
  published_at timestamptz not null default now()
);

alter table public.kbm_report_links enable row level security;

drop policy if exists "kbm links read by superadmin" on public.kbm_report_links;
create policy "kbm links read by superadmin" on public.kbm_report_links for select to authenticated
  using ((select public.is_superadmin()));

-- Tidak ada policy tulis: seluruh perubahan lewat fungsi di bawah.

create or replace function public.publish_kbm_report(target_month text, report jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token text;
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat menerbitkan laporan KBM.' using errcode = '42501';
  end if;

  if target_month !~ '^\d{4}-\d{2}$' then
    raise exception 'Bulan laporan tidak valid.' using errcode = '22023';
  end if;

  -- Token dipertahankan saat menerbitkan ulang: tautan yang sudah dibagikan ke
  -- orang tua harus tetap hidup ketika angkanya diperbarui.
  select token into new_token from public.kbm_report_links where month = target_month;
  if new_token is null then
    new_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  end if;

  insert into public.kbm_report_links (month, token, payload, published_by, published_at)
  values (target_month, new_token, report, auth.uid(), now())
  on conflict (month) do update
    set payload = excluded.payload,
        published_by = excluded.published_by,
        published_at = now();

  return new_token;
end;
$$;

create or replace function public.revoke_kbm_report(target_month text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat mencabut tautan laporan KBM.' using errcode = '42501';
  end if;
  delete from public.kbm_report_links where month = target_month;
end;
$$;

/**
 * Dipanggil halaman publik tanpa sesi login. Mengembalikan null untuk token
 * yang tidak dikenal, bukan melempar galat, supaya tautan lama yang sudah
 * dicabut tidak menampilkan pesan teknis ke orang tua.
 */
create or replace function public.kbm_report(access_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'month', link.month,
    'publishedAt', link.published_at,
    'report', link.payload
  )
  from public.kbm_report_links link
  where link.token = access_token;
$$;

grant execute on function public.publish_kbm_report(text, jsonb) to authenticated;
grant execute on function public.revoke_kbm_report(text) to authenticated;
grant execute on function public.kbm_report(text) to anon, authenticated;
