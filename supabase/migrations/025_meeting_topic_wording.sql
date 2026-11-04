-- Istilah notulensi musyawarah: "Masalah/Solusi" menjadi "Bahasan/Keputusan".
-- Yang dibahas dalam musyawarah tidak selalu masalah -- bisa penjadwalan,
-- rencana kegiatan, atau pengumuman.
--
-- Hanya DUA pesan galat yang berubah. Nama kolom `problem` dan `solution`
-- SENGAJA tidak diganti: mengganti nama kolom berarti menyentuh tabel, RPC,
-- dan seluruh pemetaan di repository untuk hasil yang tidak terlihat sedikit
-- pun di layar. Identifier internal memang tetap Inggris di projek ini.
--
-- Pesan di sini wajib sama persis dengan yang ada di DataContext.saveMeeting.
-- Kalau berbeda, pengguna melihat dua kalimat berlainan untuk kesalahan yang
-- sama, tergantung validasi mana yang kebetulan menangkapnya lebih dulu.

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
    raise exception 'Notulensi harus memuat minimal satu bahasan.' using errcode = 'P0001';
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
      raise exception 'Setiap bahasan wajib diisi keterangannya.' using errcode = 'P0001';
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

-- create or replace sebenarnya mempertahankan hak akses yang sudah ada, tetapi
-- grant ini ditulis ulang supaya migration tetap benar bila dijalankan pada
-- instance yang fungsinya pernah dibuat ulang dari nol.
grant execute on function public.save_meeting_record(uuid,text,date,jsonb) to authenticated;
