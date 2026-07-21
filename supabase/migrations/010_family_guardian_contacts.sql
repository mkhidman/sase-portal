-- Fase 9: data keluarga dan kontak wali jamaah.
-- Jalankan setelah migration 009_jamaah_lifecycle.sql.

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  address text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  jamaah_id uuid not null references public.jamaah(id) on delete cascade,
  relationship text not null check (relationship in ('Kepala Keluarga','Pasangan','Anak','Orang Tua','Saudara','Lainnya')),
  is_primary_contact boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (family_id, jamaah_id),
  unique (jamaah_id)
);

create table if not exists public.guardian_contacts (
  id uuid primary key default gen_random_uuid(),
  jamaah_id uuid not null references public.jamaah(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  relationship text not null check (relationship in ('Ayah','Ibu','Wali','Suami','Istri','Anak','Saudara','Lainnya')),
  phone text not null check (length(trim(phone)) > 0),
  is_primary boolean not null default false,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_members_family_idx on public.family_members(family_id);
create index if not exists family_members_jamaah_idx on public.family_members(jamaah_id);
create unique index if not exists family_members_one_primary_idx
  on public.family_members(family_id)
  where is_primary_contact = true;
create index if not exists guardian_contacts_jamaah_idx on public.guardian_contacts(jamaah_id, is_primary desc);
create unique index if not exists guardian_contacts_one_primary_idx
  on public.guardian_contacts(jamaah_id)
  where is_primary = true;

drop trigger if exists families_set_updated_at on public.families;
create trigger families_set_updated_at
before update on public.families
for each row execute function public.set_updated_at();

drop trigger if exists guardian_contacts_set_updated_at on public.guardian_contacts;
create trigger guardian_contacts_set_updated_at
before update on public.guardian_contacts
for each row execute function public.set_updated_at();

create or replace function public.family_in_managed_class(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin()
  or exists (
    select 1
    from public.family_members member
    where member.family_id = target_family_id
      and public.jamaah_in_managed_class(member.jamaah_id)
  );
$$;

grant execute on function public.family_in_managed_class(uuid) to authenticated;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.guardian_contacts enable row level security;

drop policy if exists "families read within access" on public.families;
create policy "families read within access"
on public.families for select to authenticated
using (public.family_in_managed_class(id));

drop policy if exists "families managed by superadmin" on public.families;
create policy "families managed by superadmin"
on public.families for all to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "family members read within access" on public.family_members;
create policy "family members read within access"
on public.family_members for select to authenticated
using (public.is_superadmin() or public.jamaah_in_managed_class(jamaah_id));

drop policy if exists "family members managed by superadmin" on public.family_members;
create policy "family members managed by superadmin"
on public.family_members for all to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "guardian contacts read within access" on public.guardian_contacts;
create policy "guardian contacts read within access"
on public.guardian_contacts for select to authenticated
using (public.is_superadmin() or public.jamaah_in_managed_class(jamaah_id));

drop policy if exists "guardian contacts managed by superadmin" on public.guardian_contacts;
create policy "guardian contacts managed by superadmin"
on public.guardian_contacts for all to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

grant select, insert, update, delete on public.families to authenticated;
grant select, insert, update, delete on public.family_members to authenticated;
grant select, insert, update, delete on public.guardian_contacts to authenticated;

-- Simpan keluarga dan seluruh anggotanya dalam satu transaksi.
create or replace function public.save_family_record(
  target_family_id uuid,
  family_name text,
  family_address text default null,
  family_notes text default null,
  member_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_family_id uuid;
  member_item jsonb;
  selected_jamaah_id uuid;
  selected_relationship text;
  selected_primary boolean;
  duplicate_family_name text;
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat mengubah data keluarga.' using errcode = '42501';
  end if;

  if nullif(trim(family_name), '') is null then
    raise exception 'Nama keluarga wajib diisi.' using errcode = '22023';
  end if;

  if jsonb_typeof(member_items) <> 'array' then
    raise exception 'Daftar anggota keluarga tidak valid.' using errcode = '22023';
  end if;
  if jsonb_array_length(member_items) = 0 then
    raise exception 'Pilih minimal satu jamaah sebagai anggota keluarga.' using errcode = '22023';
  end if;

  if target_family_id is null then
    insert into public.families (name, address, notes, created_by)
    values (trim(family_name), nullif(trim(family_address), ''), nullif(trim(family_notes), ''), auth.uid())
    returning id into saved_family_id;
  else
    update public.families
    set name = trim(family_name),
        address = nullif(trim(family_address), ''),
        notes = nullif(trim(family_notes), '')
    where id = target_family_id
    returning id into saved_family_id;

    if saved_family_id is null then
      raise exception 'Data keluarga tidak ditemukan.' using errcode = 'P0002';
    end if;
  end if;

  for member_item in select value from jsonb_array_elements(member_items)
  loop
    duplicate_family_name := null;
    selected_jamaah_id := (member_item ->> 'jamaahId')::uuid;
    selected_relationship := member_item ->> 'relationship';
    selected_primary := coalesce((member_item ->> 'isPrimaryContact')::boolean, false);

    if selected_relationship not in ('Kepala Keluarga','Pasangan','Anak','Orang Tua','Saudara','Lainnya') then
      raise exception 'Hubungan keluarga tidak valid.' using errcode = '22023';
    end if;

    select family.name into duplicate_family_name
    from public.family_members existing
    join public.families family on family.id = existing.family_id
    where existing.jamaah_id = selected_jamaah_id
      and existing.family_id <> saved_family_id;

    if duplicate_family_name is not null then
      raise exception 'Jamaah sudah terdaftar pada %.', duplicate_family_name using errcode = '23505';
    end if;
  end loop;

  delete from public.family_members where family_id = saved_family_id;

  insert into public.family_members (family_id, jamaah_id, relationship, is_primary_contact)
  select
    saved_family_id,
    (item ->> 'jamaahId')::uuid,
    item ->> 'relationship',
    coalesce((item ->> 'isPrimaryContact')::boolean, false)
  from jsonb_array_elements(member_items) as member_rows(item);

  return saved_family_id;
end;
$$;

revoke all on function public.save_family_record(uuid, text, text, text, jsonb) from public;
grant execute on function public.save_family_record(uuid, text, text, text, jsonb) to authenticated;

-- Atur kontak utama dan simpan kontak wali dalam satu transaksi.
create or replace function public.save_guardian_contact(
  target_contact_id uuid,
  target_jamaah_id uuid,
  contact_name text,
  contact_relationship text,
  contact_phone text,
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
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat mengubah kontak wali.' using errcode = '42501';
  end if;

  if nullif(trim(contact_name), '') is null then
    raise exception 'Nama kontak wali wajib diisi.' using errcode = '22023';
  end if;
  if nullif(trim(contact_phone), '') is null then
    raise exception 'Nomor WhatsApp kontak wali wajib diisi.' using errcode = '22023';
  end if;
  if contact_relationship not in ('Ayah','Ibu','Wali','Suami','Istri','Anak','Saudara','Lainnya') then
    raise exception 'Hubungan kontak wali tidak valid.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.jamaah where id = target_jamaah_id) then
    raise exception 'Data jamaah tidak ditemukan.' using errcode = 'P0002';
  end if;

  if contact_is_primary then
    update public.guardian_contacts
    set is_primary = false
    where jamaah_id = target_jamaah_id
      and (target_contact_id is null or id <> target_contact_id);
  end if;

  if target_contact_id is null then
    insert into public.guardian_contacts (
      jamaah_id, full_name, relationship, phone, is_primary, notes, created_by
    ) values (
      target_jamaah_id,
      trim(contact_name),
      contact_relationship,
      trim(contact_phone),
      contact_is_primary,
      nullif(trim(contact_notes), ''),
      auth.uid()
    ) returning id into saved_contact_id;
  else
    update public.guardian_contacts
    set jamaah_id = target_jamaah_id,
        full_name = trim(contact_name),
        relationship = contact_relationship,
        phone = trim(contact_phone),
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

revoke all on function public.save_guardian_contact(uuid, uuid, text, text, text, boolean, text) from public;
grant execute on function public.save_guardian_contact(uuid, uuid, text, text, text, boolean, text) to authenticated;

-- Catat perubahan data keluarga dan wali pada Riwayat Aktivitas.
create or replace function public.write_family_guardian_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  actor_uuid uuid := auth.uid();
  actor_full_name text;
  actor_mail text;
  jamaah_name text;
  log_summary text;
begin
  if to_regclass('public.audit_logs') is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select full_name, email into actor_full_name, actor_mail
  from public.profiles where id = actor_uuid;

  if tg_table_name = 'families' then
    log_summary := case tg_op
      when 'INSERT' then 'Menambahkan keluarga ' || coalesce(row_data ->> 'name', '')
      when 'UPDATE' then 'Memperbarui keluarga ' || coalesce(row_data ->> 'name', '')
      else 'Menghapus keluarga ' || coalesce(row_data ->> 'name', '')
    end;
  else
    select full_name into jamaah_name
    from public.jamaah where id = (row_data ->> 'jamaah_id')::uuid;
    log_summary := case tg_op
      when 'INSERT' then 'Menambahkan kontak wali untuk ' || coalesce(jamaah_name, 'jamaah')
      when 'UPDATE' then 'Memperbarui kontak wali untuk ' || coalesce(jamaah_name, 'jamaah')
      else 'Menghapus kontak wali untuk ' || coalesce(jamaah_name, 'jamaah')
    end;
  end if;

  insert into public.audit_logs (
    actor_id, actor_name, actor_email, action, entity_type, entity_id, summary, metadata
  ) values (
    actor_uuid,
    coalesce(actor_full_name, 'Sistem'),
    coalesce(actor_mail, ''),
    lower(tg_op),
    tg_table_name,
    row_data ->> 'id',
    log_summary,
    row_data
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.audit_logs') is not null then
    drop trigger if exists families_audit_trigger on public.families;
    create trigger families_audit_trigger
    after insert or update or delete on public.families
    for each row execute function public.write_family_guardian_audit();

    drop trigger if exists guardian_contacts_audit_trigger on public.guardian_contacts;
    create trigger guardian_contacts_audit_trigger
    after insert or update or delete on public.guardian_contacts
    for each row execute function public.write_family_guardian_audit();
  end if;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.families;
exception when duplicate_object then null; when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.family_members;
exception when duplicate_object then null; when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.guardian_contacts;
exception when duplicate_object then null; when undefined_object then null;
end;
$$;
