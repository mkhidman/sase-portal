-- Fase 23: notulensi musyawarah berbentuk daftar masalah, bukan karangan bebas.
--
-- Tabel memakai nama baru (meetings, bukan meeting_notes). Modul notulensi lama
-- beserta datanya dihapus permanen oleh 022 dan tidak dipulihkan di sini.

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meeting_date date not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meeting_topics (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  sort_order integer not null default 0,
  problem text not null,
  solution text not null default '',
  created_at timestamptz not null default now()
);

-- done_at menggantikan enum status: kosong berarti belum selesai, berisi berarti
-- selesai sekaligus mencatat kapan dan oleh siapa dicentang.
create table if not exists public.meeting_tasks (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.meeting_topics(id) on delete cascade,
  sort_order integer not null default 0,
  task text not null,
  pic_jamaah_id uuid not null references public.jamaah(id) on delete restrict,
  due_date date,
  done_at timestamptz,
  done_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meetings_date_idx on public.meetings(meeting_date desc, created_at desc);
create index if not exists meeting_topics_meeting_idx on public.meeting_topics(meeting_id, sort_order);
create index if not exists meeting_tasks_topic_idx on public.meeting_tasks(topic_id, sort_order);
create index if not exists meeting_tasks_open_idx on public.meeting_tasks(done_at, due_date);
create index if not exists meeting_tasks_pic_idx on public.meeting_tasks(pic_jamaah_id);

do $$
declare
  target_table text;
begin
  foreach target_table in array array['meetings', 'meeting_topics', 'meeting_tasks']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end $$;

drop trigger if exists meetings_set_updated_at on public.meetings;
create trigger meetings_set_updated_at before update on public.meetings for each row execute function public.set_updated_at();
drop trigger if exists meeting_tasks_set_updated_at on public.meeting_tasks;
create trigger meeting_tasks_set_updated_at before update on public.meeting_tasks for each row execute function public.set_updated_at();

-- Periode tertutup mengunci isi notulensinya, tetapi sengaja TIDAK mengunci
-- meeting_tasks: tugas dari musyawarah Oktober masih dikerjakan di November, dan
-- menutup buku Oktober tidak boleh membekukan pekerjaan yang masih berjalan.
create or replace function public.prevent_closed_period_meetings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_month text;
begin
  target_month := to_char(coalesce(new.meeting_date, old.meeting_date), 'YYYY-MM');
  if public.is_reporting_period_closed(target_month) then
    raise exception 'Periode % sudah ditutup. Notulensi musyawarah bulan itu tidak dapat diubah.', target_month
      using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists meetings_closed_period_guard on public.meetings;
create trigger meetings_closed_period_guard
before insert or update or delete on public.meetings
for each row execute function public.prevent_closed_period_meetings();

do $$
begin
  if to_regprocedure('public.write_audit_log()') is not null then
    drop trigger if exists meetings_audit_trigger on public.meetings;
    create trigger meetings_audit_trigger
    after insert or update or delete on public.meetings
    for each row execute function public.write_audit_log();
  end if;
end $$;

alter table public.meetings enable row level security;
alter table public.meeting_topics enable row level security;
alter table public.meeting_tasks enable row level security;

drop policy if exists "meetings readable" on public.meetings;
create policy "meetings readable" on public.meetings for select to authenticated using (true);
drop policy if exists "meetings managed by superadmin" on public.meetings;
create policy "meetings managed by superadmin" on public.meetings for all to authenticated
using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists "meeting topics readable" on public.meeting_topics;
create policy "meeting topics readable" on public.meeting_topics for select to authenticated using (true);
drop policy if exists "meeting topics managed by superadmin" on public.meeting_topics;
create policy "meeting topics managed by superadmin" on public.meeting_topics for all to authenticated
using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists "meeting tasks readable" on public.meeting_tasks;
create policy "meeting tasks readable" on public.meeting_tasks for select to authenticated using (true);
drop policy if exists "meeting tasks managed by superadmin" on public.meeting_tasks;
create policy "meeting tasks managed by superadmin" on public.meeting_tasks for all to authenticated
using (public.is_superadmin()) with check (public.is_superadmin());

grant select, insert, update, delete on public.meetings to authenticated;
grant select, insert, update, delete on public.meeting_topics to authenticated;
grant select, insert, update, delete on public.meeting_tasks to authenticated;

-- Satu notulensi disimpan sebagai satu transaksi: header, daftar masalah, dan tugas
-- tiap masalah. Baris yang sudah ada DIPERBARUI, bukan dihapus lalu disisipkan ulang,
-- supaya centang "selesai" (done_at) tidak ikut terhapus setiap kali notulensi disunting.
create or replace function public.save_meeting_record(
  target_meeting_id uuid,
  meeting_title text,
  meeting_date_value date,
  topic_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_meeting_id uuid;
  topic_item jsonb;
  task_item jsonb;
  topic_index integer := 0;
  task_index integer;
  resolved_topic_id uuid;
  resolved_task_id uuid;
  kept_topic_ids uuid[] := array[]::uuid[];
  kept_task_ids uuid[];
  task_pic_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Pengguna belum terautentikasi.' using errcode = '42501';
  end if;
  if not public.is_superadmin() then
    raise exception 'Hanya Superadmin yang dapat mengubah notulensi musyawarah.' using errcode = '42501';
  end if;
  if nullif(trim(meeting_title), '') is null then
    raise exception 'Judul musyawarah wajib diisi.' using errcode = 'P0001';
  end if;
  if meeting_date_value is null then
    raise exception 'Tanggal musyawarah wajib diisi.' using errcode = 'P0001';
  end if;
  if meeting_date_value > current_date then
    raise exception 'Tanggal musyawarah tidak boleh berada di masa depan.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(topic_items, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(topic_items, '[]'::jsonb)) = 0 then
    raise exception 'Notulensi harus memuat minimal satu masalah.' using errcode = 'P0001';
  end if;

  if target_meeting_id is null then
    insert into public.meetings (title, meeting_date, created_by)
    values (trim(meeting_title), meeting_date_value, auth.uid())
    returning id into resolved_meeting_id;
  else
    update public.meetings
    set title = trim(meeting_title), meeting_date = meeting_date_value
    where id = target_meeting_id;
    if not found then
      raise exception 'Notulensi tidak ditemukan.' using errcode = 'P0001';
    end if;
    resolved_meeting_id := target_meeting_id;
  end if;

  for topic_item in select value from jsonb_array_elements(topic_items)
  loop
    if nullif(trim(topic_item ->> 'problem'), '') is null then
      raise exception 'Masalah wajib diisi pada setiap bahasan.' using errcode = 'P0001';
    end if;

    resolved_topic_id := nullif(topic_item ->> 'id', '')::uuid;
    if resolved_topic_id is null or not exists (
      select 1 from public.meeting_topics
      where id = resolved_topic_id and meeting_id = resolved_meeting_id
    ) then
      insert into public.meeting_topics (meeting_id, sort_order, problem, solution)
      values (
        resolved_meeting_id, topic_index,
        trim(topic_item ->> 'problem'),
        coalesce(trim(topic_item ->> 'solution'), '')
      )
      returning id into resolved_topic_id;
    else
      update public.meeting_topics
      set sort_order = topic_index,
          problem = trim(topic_item ->> 'problem'),
          solution = coalesce(trim(topic_item ->> 'solution'), '')
      where id = resolved_topic_id;
    end if;
    kept_topic_ids := kept_topic_ids || resolved_topic_id;

    task_index := 0;
    kept_task_ids := array[]::uuid[];
    for task_item in select value from jsonb_array_elements(coalesce(topic_item -> 'tasks', '[]'::jsonb))
    loop
      if nullif(trim(task_item ->> 'task'), '') is null then
        raise exception 'Tugas wajib diisi pada setiap baris tindak lanjut.' using errcode = 'P0001';
      end if;
      task_pic_id := nullif(task_item ->> 'picJamaahId', '')::uuid;
      if task_pic_id is null then
        raise exception 'Setiap tugas wajib memiliki penanggung jawab.' using errcode = 'P0001';
      end if;
      if not exists (select 1 from public.jamaah where id = task_pic_id) then
        raise exception 'Penanggung jawab harus dipilih dari data warga.' using errcode = 'P0001';
      end if;

      resolved_task_id := nullif(task_item ->> 'id', '')::uuid;
      if resolved_task_id is not null and exists (
        select 1 from public.meeting_tasks where id = resolved_task_id and topic_id = resolved_topic_id
      ) then
        update public.meeting_tasks
        set sort_order = task_index,
            task = trim(task_item ->> 'task'),
            pic_jamaah_id = task_pic_id,
            due_date = nullif(task_item ->> 'dueDate', '')::date
        where id = resolved_task_id;
      else
        insert into public.meeting_tasks (topic_id, sort_order, task, pic_jamaah_id, due_date)
        values (
          resolved_topic_id, task_index,
          trim(task_item ->> 'task'),
          task_pic_id,
          nullif(task_item ->> 'dueDate', '')::date
        )
        returning id into resolved_task_id;
      end if;
      kept_task_ids := kept_task_ids || resolved_task_id;
      task_index := task_index + 1;
    end loop;

    delete from public.meeting_tasks
    where topic_id = resolved_topic_id and not (id = any (kept_task_ids));

    topic_index := topic_index + 1;
  end loop;

  delete from public.meeting_topics
  where meeting_id = resolved_meeting_id and not (id = any (kept_topic_ids));

  return resolved_meeting_id;
end;
$$;

revoke all on function public.save_meeting_record(uuid,text,date,jsonb) from public;
grant execute on function public.save_meeting_record(uuid,text,date,jsonb) to authenticated;
