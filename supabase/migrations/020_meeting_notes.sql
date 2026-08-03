-- Fase 20: notulensi musyawarah dan tindak lanjut keputusan.

do $$ begin
  create type public.meeting_note_status as enum ('draft', 'final');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.meeting_action_status as enum ('pending', 'in_progress', 'completed');
exception when duplicate_object then null; end $$;

create table if not exists public.meeting_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meeting_date date not null,
  agenda text not null default '',
  discussion_summary text not null default '',
  decisions text not null default '',
  additional_notes text not null default '',
  status public.meeting_note_status not null default 'draft',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meeting_note_participants (
  meeting_note_id uuid not null references public.meeting_notes(id) on delete cascade,
  jamaah_id uuid not null references public.jamaah(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (meeting_note_id, jamaah_id)
);

create table if not exists public.meeting_note_actions (
  id uuid primary key default gen_random_uuid(),
  meeting_note_id uuid not null references public.meeting_notes(id) on delete cascade,
  task text not null,
  assignee_jamaah_id uuid references public.jamaah(id) on delete set null,
  due_date date,
  status public.meeting_action_status not null default 'pending',
  notes text not null default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meeting_notes_date_idx on public.meeting_notes(meeting_date desc, created_at desc);
create index if not exists meeting_note_participants_jamaah_idx on public.meeting_note_participants(jamaah_id);
create index if not exists meeting_note_actions_status_idx on public.meeting_note_actions(status, due_date);
create index if not exists meeting_note_actions_assignee_idx on public.meeting_note_actions(assignee_jamaah_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['meeting_notes', 'meeting_note_participants', 'meeting_note_actions']
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

drop trigger if exists meeting_notes_set_updated_at on public.meeting_notes;
create trigger meeting_notes_set_updated_at before update on public.meeting_notes for each row execute function public.set_updated_at();
drop trigger if exists meeting_note_actions_set_updated_at on public.meeting_note_actions;
create trigger meeting_note_actions_set_updated_at before update on public.meeting_note_actions for each row execute function public.set_updated_at();

alter table public.meeting_notes enable row level security;
alter table public.meeting_note_participants enable row level security;
alter table public.meeting_note_actions enable row level security;

drop policy if exists "meeting notes readable" on public.meeting_notes;
create policy "meeting notes readable" on public.meeting_notes for select to authenticated using (true);
drop policy if exists "meeting note participants readable" on public.meeting_note_participants;
create policy "meeting note participants readable" on public.meeting_note_participants for select to authenticated using (true);
drop policy if exists "meeting note actions readable" on public.meeting_note_actions;
create policy "meeting note actions readable" on public.meeting_note_actions for select to authenticated using (true);

create or replace function public.save_meeting_note_record(
  target_note_id uuid,
  meeting_title text,
  meeting_date_value date,
  meeting_agenda text,
  meeting_discussion_summary text,
  meeting_decisions text,
  meeting_additional_notes text,
  meeting_status_value public.meeting_note_status,
  participant_ids jsonb,
  action_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_note_id uuid;
  participant_id uuid;
  action_item jsonb;
  assignee_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Pengguna belum terautentikasi.' using errcode = '42501';
  end if;

  if nullif(trim(meeting_title), '') is null then
    raise exception 'Judul musyawarah wajib diisi.' using errcode = 'P0001';
  end if;

  if meeting_date_value is null then
    raise exception 'Tanggal musyawarah wajib diisi.' using errcode = 'P0001';
  end if;

  if jsonb_typeof(coalesce(participant_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'Daftar peserta tidak valid.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(participant_ids, '[]'::jsonb)) item(value)
    where not exists (
      select 1 from public.jamaah j
      where j.id = item.value::uuid
    )
  ) then
    raise exception 'Peserta harus berasal dari warga aktif.' using errcode = 'P0001';
  end if;

  if target_note_id is null then
    insert into public.meeting_notes (
      title, meeting_date, agenda, discussion_summary, decisions, additional_notes, status, created_by
    ) values (
      trim(meeting_title), meeting_date_value, coalesce(trim(meeting_agenda), ''),
      coalesce(trim(meeting_discussion_summary), ''), coalesce(trim(meeting_decisions), ''),
      coalesce(trim(meeting_additional_notes), ''), meeting_status_value, auth.uid()
    ) returning id into resolved_note_id;
  else
    update public.meeting_notes
    set title = trim(meeting_title),
        meeting_date = meeting_date_value,
        agenda = coalesce(trim(meeting_agenda), ''),
        discussion_summary = coalesce(trim(meeting_discussion_summary), ''),
        decisions = coalesce(trim(meeting_decisions), ''),
        additional_notes = coalesce(trim(meeting_additional_notes), ''),
        status = meeting_status_value
    where id = target_note_id;
    if not found then
      raise exception 'Notulensi tidak ditemukan.' using errcode = 'P0001';
    end if;
    resolved_note_id := target_note_id;
  end if;

  delete from public.meeting_note_actions where meeting_note_id = resolved_note_id;
  delete from public.meeting_note_participants where meeting_note_id = resolved_note_id;

  for participant_id in select value::uuid from jsonb_array_elements_text(coalesce(participant_ids, '[]'::jsonb))
  loop
    insert into public.meeting_note_participants (meeting_note_id, jamaah_id)
    values (resolved_note_id, participant_id);
  end loop;

  if jsonb_typeof(coalesce(action_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Daftar tindak lanjut tidak valid.' using errcode = 'P0001';
  end if;

  for action_item in select value from jsonb_array_elements(coalesce(action_items, '[]'::jsonb))
  loop
    if nullif(trim(action_item ->> 'task'), '') is null then
      raise exception 'Tugas tindak lanjut wajib diisi.' using errcode = 'P0001';
    end if;

    assignee_id := nullif(action_item ->> 'assigneeJamaahId', '')::uuid;
    if assignee_id is not null and not exists (
      select 1 from jsonb_array_elements_text(coalesce(participant_ids, '[]'::jsonb)) item(value)
      where item.value::uuid = assignee_id
    ) then
      raise exception 'Penanggung jawab tindak lanjut harus merupakan peserta musyawarah.' using errcode = 'P0001';
    end if;

    insert into public.meeting_note_actions (
      meeting_note_id, task, assignee_jamaah_id, due_date, status, notes, created_by
    ) values (
      resolved_note_id,
      trim(action_item ->> 'task'),
      assignee_id,
      nullif(action_item ->> 'dueDate', '')::date,
      coalesce(nullif(action_item ->> 'status', ''), 'pending')::public.meeting_action_status,
      coalesce(trim(action_item ->> 'notes'), ''),
      auth.uid()
    );
  end loop;

  return resolved_note_id;
end;
$$;

revoke all on function public.save_meeting_note_record(uuid,text,date,text,text,text,text,public.meeting_note_status,jsonb,jsonb) from public;
grant execute on function public.save_meeting_note_record(uuid,text,date,text,text,text,text,public.meeting_note_status,jsonb,jsonb) to authenticated;
