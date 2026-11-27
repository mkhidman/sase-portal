-- Melepas warga dari sebuah kelas tanpa kelas tujuan, sekaligus menetapkan
-- kategori sensusnya -- dengan tanggal efektif dan riwayat, seperti kenaikan kelas.
--
-- Kasus yang memaksanya ada: warga Pra Nikah yang menikah. Kelas Pra Nikah-nya
-- lepas, ia hanya ikut Pengajian Umum (kelas yang sudah diikutinya sejak lama),
-- dan kategorinya jadi 'Menikah'.
--
-- Sebelum ini satu-satunya jalan adalah mengubah kategori lewat form Data Sensus,
-- dan itu TIDAK menulis riwayat apa pun. Akibatnya jamaahSnapshotsAsOfDate() tidak
-- punya apa-apa untuk diputar mundur, sehingga seluruh laporan bulan lampau ikut
-- berubah: kategori 'Menikah' dikecualikan dari target Hasda/ASAD, jadi penyebut
-- ketuntasan bulan-bulan yang sudah dicetak bergeser tanpa satu pun pesan di layar.
--
-- Memindahkan warga ke kelas 'Pengajian Umum' sebagai tujuan sengaja TIDAK dipakai:
-- kelas itu diikuti semua kategori, dan mencatatnya sebagai kelas tujuan membuat
-- riwayatnya berbohong -- seolah warga itu baru masuk Pengajian Umum hari itu.
-- Melepas tanpa tujuan menggambarkan yang sebenarnya terjadi, dan model datanya
-- sudah mendukungnya: to_class_id boleh null, check constraint hanya menuntut
-- salah satu dari from/to terisi, dan pemutar-mundur di klien sudah menjaga null.

-- Nama constraint-nya dibuat otomatis Postgres saat migration 008, jadi dicari
-- lebih dulu, bukan ditebak: menebak lalu meleset membuat "drop if exists" lewat
-- tanpa keluhan, constraint lama tetap hidup, dan setiap pelepasan kelas gagal
-- dengan "violates check constraint" yang tidak jelas asalnya.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public'
      and cls.relname = 'class_membership_history'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%change_type%'
  loop
    execute format('alter table public.class_membership_history drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.class_membership_history
  add constraint class_membership_history_change_type_check
  check (change_type in ('promotion', 'transfer', 'manual', 'release'));

-- Tanda tangannya bertambah satu parameter, jadi versi lamanya dibuang lebih dulu;
-- create or replace akan meninggalkan dua fungsi bernama sama yang saling rancu.
drop function if exists public.bulk_transition_jamaah_classes(uuid[], uuid, uuid, date, text, text, boolean);

create or replace function public.bulk_transition_jamaah_classes(
  target_jamaah_ids uuid[],
  source_class_id uuid,
  destination_class_id uuid,
  transition_date date,
  transition_type text default 'promotion',
  transition_notes text default null,
  update_census boolean default true,
  target_census_category text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  source_name text;
  destination_name text;
  old_category text;
  next_category text;
  changed_count integer := 0;
  transition_month text;
  releasing boolean := destination_class_id is null;
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat melakukan kenaikan kelas atau mutasi.' using errcode = '42501';
  end if;

  if source_class_id is null then
    raise exception 'Kelas asal wajib diisi.' using errcode = '22023';
  end if;

  if not releasing and source_class_id = destination_class_id then
    raise exception 'Kelas asal dan kelas tujuan harus berbeda.' using errcode = '22023';
  end if;

  if transition_type not in ('promotion','transfer','manual','release') then
    raise exception 'Jenis perubahan kelas tidak valid.' using errcode = '22023';
  end if;

  -- Tanpa kelas tujuan tidak ada nama kelas yang bisa dipakai menurunkan kategori,
  -- jadi kategorinya harus disebut. Membiarkannya kosong berarti warga kehilangan
  -- kelas tetapi kategorinya diam di nilai lama, dan itu justru keadaan yang
  -- hendak diperbaiki fungsi ini.
  if releasing and coalesce(trim(target_census_category), '') = '' then
    raise exception 'Kategori sensus tujuan wajib diisi ketika melepas warga tanpa kelas tujuan.' using errcode = '22023';
  end if;

  if coalesce(array_length(target_jamaah_ids, 1), 0) = 0 then
    return 0;
  end if;

  transition_month := substring(transition_date::text from 1 for 7);
  if to_regprocedure('public.is_reporting_period_closed(text)') is not null
     and public.is_reporting_period_closed(transition_month) then
    raise exception 'Periode % sudah ditutup. Gunakan tanggal efektif pada periode yang masih terbuka.', transition_month
      using errcode = 'P0001';
  end if;

  select name into source_name from public.study_classes where id = source_class_id and active = true;
  if source_name is null then
    raise exception 'Kelas asal tidak ditemukan/tidak aktif.' using errcode = 'P0002';
  end if;

  if not releasing then
    select name into destination_name from public.study_classes where id = destination_class_id and active = true;
    if destination_name is null then
      raise exception 'Kelas tujuan tidak ditemukan/tidak aktif.' using errcode = 'P0002';
    end if;
  end if;

  foreach target_id in array target_jamaah_ids
  loop
    select census_category into old_category
    from public.jamaah
    where id = target_id and active = true
    for update;

    if old_category is null then
      continue;
    end if;

    if not exists (
      select 1 from public.jamaah_classes
      where jamaah_id = target_id and class_id = source_class_id
    ) then
      continue;
    end if;

    next_category := case
      when releasing then trim(target_census_category)
      when update_census then public.census_category_for_class(destination_name, old_category)
      else old_category
    end;

    delete from public.jamaah_classes
    where jamaah_id = target_id and class_id = source_class_id;

    if not releasing then
      insert into public.jamaah_classes (jamaah_id, class_id)
      values (target_id, destination_class_id)
      on conflict (jamaah_id, class_id) do nothing;
    end if;

    if next_category <> old_category then
      update public.jamaah
      set census_category = next_category
      where id = target_id;
    end if;

    insert into public.class_membership_history (
      jamaah_id,
      from_class_id,
      to_class_id,
      previous_census_category,
      new_census_category,
      effective_date,
      change_type,
      notes,
      changed_by
    ) values (
      target_id,
      source_class_id,
      destination_class_id,
      old_category,
      next_category,
      transition_date,
      transition_type,
      nullif(trim(transition_notes), ''),
      auth.uid()
    );

    changed_count := changed_count + 1;
  end loop;

  return changed_count;
end;
$$;

grant execute on function public.bulk_transition_jamaah_classes(uuid[], uuid, uuid, date, text, text, boolean, text) to authenticated;
