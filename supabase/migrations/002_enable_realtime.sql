-- Aktifkan sinkronisasi realtime untuk tabel operasional.
-- Aman dijalankan lebih dari sekali.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'jamaah',
    'jamaah_classes',
    'schedules',
    'attendance_sessions',
    'attendance_records',
    'material_completions',
    'admin_class_assignments'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
