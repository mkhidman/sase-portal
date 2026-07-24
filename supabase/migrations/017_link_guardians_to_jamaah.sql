-- Tautkan wali ke data jamaah agar nama dan nomor tidak diketik ulang.
alter table public.guardian_contacts
  add column if not exists guardian_jamaah_id uuid;

do $$
begin
  alter table public.guardian_contacts
    add constraint guardian_contacts_guardian_jamaah_fk
    foreign key (guardian_jamaah_id)
    references public.jamaah(id)
    on delete set null;
exception
  when duplicate_object then null;
end;
$$;

create index if not exists guardian_contacts_guardian_jamaah_idx
  on public.guardian_contacts(guardian_jamaah_id);

alter table public.guardian_contacts
  drop constraint if exists guardian_contacts_relationship_check;
alter table public.guardian_contacts
  add constraint guardian_contacts_relationship_check
  check (relationship in ('Diri Sendiri','Ayah','Ibu','Wali','Suami','Istri','Anak','Saudara','Lainnya'));

-- Nomor mengikuti profil warga terpilih dan boleh kosong bila profilnya belum memiliki nomor.
alter table public.guardian_contacts
  drop constraint if exists guardian_contacts_phone_check;

-- Tautkan data lama hanya bila nama tersebut unik pada tabel jamaah.
with unique_jamaah_names as (
  select
    lower(trim(full_name)) as normalized_name,
    (array_agg(id order by id))[1] as jamaah_id
  from public.jamaah
  group by lower(trim(full_name))
  having count(*) = 1
)
update public.guardian_contacts contact
set guardian_jamaah_id = matched.jamaah_id
from unique_jamaah_names matched
where contact.guardian_jamaah_id is null
  and lower(trim(contact.full_name)) = matched.normalized_name;

update public.guardian_contacts
set relationship = 'Diri Sendiri'
where guardian_jamaah_id = jamaah_id;

update public.guardian_contacts contact
set full_name = guardian.full_name,
    phone = coalesce(guardian.phone, '')
from public.jamaah guardian
where guardian.id = contact.guardian_jamaah_id;

create or replace function public.sync_linked_guardian_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.guardian_contacts
  set full_name = new.full_name,
      phone = coalesce(new.phone, '')
  where guardian_jamaah_id = new.id
    and (full_name is distinct from new.full_name or phone is distinct from coalesce(new.phone, ''));
  return new;
end;
$$;

drop trigger if exists jamaah_sync_linked_guardian_snapshot on public.jamaah;
create trigger jamaah_sync_linked_guardian_snapshot
after update of full_name, phone on public.jamaah
for each row execute function public.sync_linked_guardian_snapshot();

create or replace function public.save_linked_guardian_contact(
  target_contact_id uuid,
  target_jamaah_id uuid,
  selected_guardian_jamaah_id uuid,
  contact_relationship text,
  contact_is_primary boolean default false,
  contact_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_contact_id uuid;
  guardian_name text;
  guardian_phone text;
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat mengubah kontak wali.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.jamaah where id = target_jamaah_id) then
    raise exception 'Data warga yang menerima wali tidak ditemukan.' using errcode = 'P0002';
  end if;

  select full_name, coalesce(phone, '')
  into guardian_name, guardian_phone
  from public.jamaah
  where id = selected_guardian_jamaah_id;

  if guardian_name is null then
    raise exception 'Pilih wali dari data warga.' using errcode = 'P0002';
  end if;

  if selected_guardian_jamaah_id = target_jamaah_id then
    contact_relationship := 'Diri Sendiri';
  elsif contact_relationship = 'Diri Sendiri' then
    raise exception 'Hubungan Diri Sendiri hanya dapat dipakai ketika warga menjadi walinya sendiri.' using errcode = '22023';
  elsif contact_relationship not in ('Ayah','Ibu','Wali','Suami','Istri','Anak','Saudara','Lainnya') then
    raise exception 'Hubungan kontak wali tidak valid.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.guardian_contacts existing
    where existing.jamaah_id = target_jamaah_id
      and existing.guardian_jamaah_id = selected_guardian_jamaah_id
      and (target_contact_id is null or existing.id <> target_contact_id)
  ) then
    raise exception 'Warga tersebut sudah terdaftar sebagai wali.' using errcode = '23505';
  end if;

  if contact_is_primary then
    update public.guardian_contacts
    set is_primary = false
    where jamaah_id = target_jamaah_id
      and (target_contact_id is null or id <> target_contact_id);
  end if;

  if target_contact_id is null then
    insert into public.guardian_contacts (
      jamaah_id, guardian_jamaah_id, full_name, relationship, phone,
      is_primary, notes, created_by
    ) values (
      target_jamaah_id,
      selected_guardian_jamaah_id,
      trim(guardian_name),
      contact_relationship,
      trim(guardian_phone),
      contact_is_primary,
      nullif(trim(contact_notes), ''),
      auth.uid()
    )
    returning id into saved_contact_id;
  else
    update public.guardian_contacts
    set jamaah_id = target_jamaah_id,
        guardian_jamaah_id = selected_guardian_jamaah_id,
        full_name = trim(guardian_name),
        relationship = contact_relationship,
        phone = trim(guardian_phone),
        is_primary = contact_is_primary,
        notes = nullif(trim(contact_notes), '')
    where id = target_contact_id
    returning id into saved_contact_id;

    if saved_contact_id is null then
      raise exception 'Kontak wali tidak ditemukan.' using errcode = 'P0002';
    end if;
  end if;

  return saved_contact_id;
end;
$$;

revoke all on function public.save_linked_guardian_contact(uuid, uuid, uuid, text, boolean, text) from public;
grant execute on function public.save_linked_guardian_contact(uuid, uuid, uuid, text, boolean, text) to authenticated;
revoke execute on function public.save_guardian_contact(uuid, uuid, text, text, text, boolean, text) from authenticated;

-- Jaga tautan wali ketika dua data jamaah digabungkan.
do $$
begin
  if to_regprocedure('public.merge_jamaah_duplicates_before_guardian_links(uuid,uuid,jsonb)') is null then
    execute 'alter function public.merge_jamaah_duplicates(uuid, uuid, jsonb) rename to merge_jamaah_duplicates_before_guardian_links';
  end if;
end;
$$;

revoke all on function public.merge_jamaah_duplicates_before_guardian_links(uuid, uuid, jsonb) from public;
revoke all on function public.merge_jamaah_duplicates_before_guardian_links(uuid, uuid, jsonb) from authenticated;

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
  merge_result jsonb;
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat menggabungkan data jamaah.' using errcode = '42501';
  end if;

  update public.guardian_contacts
  set guardian_jamaah_id = primary_id
  where guardian_jamaah_id = duplicate_id;

  merge_result := public.merge_jamaah_duplicates_before_guardian_links(
    primary_id,
    duplicate_id,
    merged_values
  );

  update public.guardian_contacts contact
  set full_name = guardian.full_name,
      phone = coalesce(guardian.phone, '')
  from public.jamaah guardian
  where guardian.id = primary_id
    and contact.guardian_jamaah_id = primary_id;

  return merge_result;
end;
$$;

revoke all on function public.merge_jamaah_duplicates(uuid, uuid, jsonb) from public;
grant execute on function public.merge_jamaah_duplicates(uuid, uuid, jsonb) to authenticated;
