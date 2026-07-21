-- Fase 3: import massal data sensus dalam satu transaksi.

create or replace function public.bulk_import_jamaah(items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  class_id_value text;
  imported_count integer := 0;
begin
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat mengimpor data sensus.' using errcode = '42501';
  end if;

  if jsonb_typeof(items) <> 'array' then
    raise exception 'Payload import harus berupa array.';
  end if;

  for item in select value from jsonb_array_elements(items)
  loop
    insert into public.jamaah (
      id,
      full_name,
      gender,
      birth_date,
      phone,
      census_category,
      active,
      created_by
    ) values (
      (item ->> 'id')::uuid,
      trim(item ->> 'fullName'),
      (item ->> 'gender')::public.gender_type,
      nullif(trim(coalesce(item ->> 'birthDate', '')), '')::date,
      nullif(trim(coalesce(item ->> 'phone', '')), ''),
      item ->> 'censusCategory',
      coalesce((item ->> 'active')::boolean, true),
      auth.uid()
    );

    for class_id_value in
      select jsonb_array_elements_text(coalesce(item -> 'classIds', '[]'::jsonb))
    loop
      insert into public.jamaah_classes (jamaah_id, class_id)
      values ((item ->> 'id')::uuid, class_id_value::uuid);
    end loop;

    imported_count := imported_count + 1;
  end loop;

  return imported_count;
end;
$$;

revoke all on function public.bulk_import_jamaah(jsonb) from public;
grant execute on function public.bulk_import_jamaah(jsonb) to authenticated;
