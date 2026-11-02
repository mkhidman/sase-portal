import { CalendarDays, CircleAlert, ClipboardList, ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { useConfirm } from '../components/useConfirm'
import { EmptyState, InlineMessage, PageHeader, StatCard } from '../components/UI'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { feedbackFrom, feedbackOk, type Feedback } from '../lib/feedback'
import { meetingSummary, openMeetingTaskRows } from '../lib/meetingTasks'
import { formatDate, localIsoDate } from '../lib/utils'
import type { Meeting, MeetingTask, MeetingTopic } from '../types/domain'

interface TaskDraft {
  id: string
  task: string
  picJamaahId: string
  dueDate: string
  doneAt: string | null
  doneBy: string | null
}

interface TopicDraft {
  id: string
  problem: string
  solution: string
  tasks: TaskDraft[]
}

function newTaskDraft(): TaskDraft {
  return { id: `new-${crypto.randomUUID()}`, task: '', picJamaahId: '', dueDate: '', doneAt: null, doneBy: null }
}

function newTopicDraft(): TopicDraft {
  return { id: `new-${crypto.randomUUID()}`, problem: '', solution: '', tasks: [newTaskDraft()] }
}

export function MeetingsPage() {
  const { user } = useAuth()
  const {
    jamaah,
    meetings,
    meetingTopics,
    meetingTasks,
    saveMeeting,
    deleteMeeting,
    toggleMeetingTaskDone,
    isPeriodClosed,
  } = useData()
  const [message, setMessage] = useState<Feedback | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [header, setHeader] = useState<{ id: string; title: string; meetingDate: string }>({ id: '', title: '', meetingDate: '' })
  const [topicDrafts, setTopicDrafts] = useState<TopicDraft[]>([])
  const [picFilter, setPicFilter] = useState('')
  const { confirm, dialog: confirmDialog } = useConfirm()

  const today = localIsoDate()
  const jamaahMap = useMemo(() => new Map(jamaah.map((item) => [item.id, item])), [jamaah])
  const picCandidates = useMemo(
    () => jamaah.filter((item) => item.active).sort((a, b) => a.fullName.localeCompare(b.fullName, 'id')),
    [jamaah],
  )
  const openRows = useMemo(
    () => openMeetingTaskRows(meetings, meetingTopics, meetingTasks, today),
    [meetingTasks, meetingTopics, meetings, today],
  )
  const filteredRows = useMemo(
    () => picFilter ? openRows.filter((row) => row.task.picJamaahId === picFilter) : openRows,
    [openRows, picFilter],
  )
  const picsWithOpenTasks = useMemo(() => {
    const ids = new Set(openRows.map((row) => row.task.picJamaahId))
    return [...ids]
      .map((id) => jamaahMap.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'))
  }, [jamaahMap, openRows])
  const overdueCount = openRows.filter((row) => row.overdue).length
  const doneCount = meetingTasks.filter((item) => item.doneAt).length

  const sortedMeetings = useMemo(
    () => [...meetings].sort((a, b) => b.meetingDate.localeCompare(a.meetingDate)),
    [meetings],
  )

  function openCreate() {
    setHeader({ id: `new-${crypto.randomUUID()}`, title: '', meetingDate: today })
    setTopicDrafts([newTopicDraft()])
    setModalError(null)
    setOpen(true)
  }

  function openEdit(meeting: Meeting) {
    const topics = meetingTopics
      .filter((item) => item.meetingId === meeting.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    setHeader({ id: meeting.id, title: meeting.title, meetingDate: meeting.meetingDate })
    setTopicDrafts(topics.map((topic) => ({
      id: topic.id,
      problem: topic.problem,
      solution: topic.solution,
      tasks: meetingTasks
        .filter((task) => task.topicId === topic.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((task) => ({ id: task.id, task: task.task, picJamaahId: task.picJamaahId, dueDate: task.dueDate, doneAt: task.doneAt, doneBy: task.doneBy })),
    })))
    setModalError(null)
    setOpen(true)
  }

  function updateTopic(topicId: string, patch: Partial<TopicDraft>) {
    setTopicDrafts((current) => current.map((topic) => topic.id === topicId ? { ...topic, ...patch } : topic))
  }

  function updateTask(topicId: string, taskId: string, patch: Partial<TaskDraft>) {
    setTopicDrafts((current) => current.map((topic) => topic.id === topicId
      ? { ...topic, tasks: topic.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task) }
      : topic))
  }

  async function submit() {
    setModalError(null)
    const topics: MeetingTopic[] = topicDrafts.map((topic, index) => ({
      id: topic.id,
      meetingId: header.id,
      sortOrder: index,
      problem: topic.problem.trim(),
      solution: topic.solution.trim(),
    }))
    const tasks: MeetingTask[] = topicDrafts.flatMap((topic) => topic.tasks
      // Baris tugas yang dibiarkan kosong seluruhnya diabaikan, bukan ditolak:
      // formulir selalu menyisakan satu baris kosong di bawah.
      .filter((task) => task.task.trim() || task.picJamaahId || task.dueDate)
      .map((task, index) => ({
        id: task.id,
        topicId: topic.id,
        sortOrder: index,
        task: task.task.trim(),
        picJamaahId: task.picJamaahId,
        dueDate: task.dueDate,
        doneAt: task.doneAt,
        doneBy: task.doneBy,
      })))

    const meeting: Meeting = {
      id: header.id,
      title: header.title.trim(),
      meetingDate: header.meetingDate,
      createdBy: meetings.find((item) => item.id === header.id)?.createdBy ?? user?.id ?? null,
      createdAt: meetings.find((item) => item.id === header.id)?.createdAt ?? '',
      updatedAt: '',
    }

    setSaving(true)
    try {
      await saveMeeting({ meeting, topics, tasks })
      setOpen(false)
      setMessage(feedbackOk('Notulensi musyawarah tersimpan.'))
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : 'Gagal menyimpan notulensi.')
    } finally {
      setSaving(false)
    }
  }

  async function removeMeetingRecord(meeting: Meeting) {
    const summary = meetingSummary(meeting.id, meetingTopics, meetingTasks)
    const approved = await confirm({
      title: 'Hapus notulensi musyawarah?',
      description: `${meeting.title} (${formatDate(meeting.meetingDate)}) beserta ${summary.topicCount} masalah dan ${summary.taskCount} tugas akan hilang permanen, termasuk tugas yang belum selesai.`,
      confirmLabel: 'Hapus Notulensi',
      tone: 'danger',
    })
    if (!approved) return
    try {
      await deleteMeeting(meeting.id)
      setMessage(feedbackOk('Notulensi musyawarah dihapus.'))
    } catch (cause) {
      setMessage(feedbackFrom(cause, 'Gagal menghapus notulensi.'))
    }
  }

  async function toggleTask(task: MeetingTask) {
    try {
      await toggleMeetingTaskDone(task.id, !task.doneAt)
    } catch (cause) {
      setMessage(feedbackFrom(cause, 'Gagal mengubah status tugas.'))
    }
  }

  const headerPeriodClosed = Boolean(header.meetingDate && isPeriodClosed(header.meetingDate.slice(0, 7)))

  return (
    <>
      <PageHeader
        title="Musyawarah"
        description="Setiap bahasan dicatat sebagai masalah, solusinya, dan tugas siapa. Tugas dari seluruh musyawarah terhimpun di satu daftar agar bisa ditagih."
        actions={<button className="button primary" onClick={openCreate}><Plus size={16} /> Tambah Notulensi</button>}
      />

      <section className="stats-grid four-columns compact-stats">
        <StatCard tone="mint" label="Notulensi Tercatat" value={meetings.length} note="Seluruh musyawarah yang tercatat" icon={<ClipboardList size={20} />} />
        <StatCard tone="sky" label="Tugas Belum Selesai" value={openRows.length} note="Menunggu dikerjakan atau dicentang" icon={<ListChecks size={20} />} />
        <StatCard tone="amber" label="Lewat Batas Tanggal" value={overdueCount} note="Belum selesai padahal sudah jatuh tempo" icon={<CircleAlert size={20} />} />
        <StatCard tone="violet" label="Tugas Selesai" value={doneCount} note="Sudah dicentang selesai" icon={<CalendarDays size={20} />} />
      </section>

      <InlineMessage value={message} className="page-message" />

      <article className="card">
        <div className="card-heading">
          <div>
            <h2>Tugas Belum Selesai</h2>
            <p>Batas tanggal terdekat lebih dulu. Tugas tanpa batas tanggal berada di bawah.</p>
          </div>
          <select value={picFilter} onChange={(event) => setPicFilter(event.target.value)} aria-label="Saring menurut penanggung jawab">
            <option value="">Semua penanggung jawab</option>
            {picsWithOpenTasks.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
          </select>
        </div>
        {filteredRows.length ? (
          <div className="table-wrap">
            <table role="table">
              <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Selesai</th><th scope="col" role="columnheader">Tugas</th><th scope="col" role="columnheader">Penanggung jawab</th><th scope="col" role="columnheader">Batas tanggal</th><th scope="col" role="columnheader">Asal musyawarah</th></tr></thead>
              <tbody role="rowgroup">
                {filteredRows.map((row) => (
                  <tr role="row" key={row.task.id}>
                    <td role="cell" data-label="Selesai"><input type="checkbox" checked={false} aria-label={`Tandai selesai: ${row.task.task}`} onChange={() => void toggleTask(row.task)} /></td>
                    <td role="cell" data-cell="primary"><strong>{row.task.task}</strong><div className="table-subtle">{row.topic.problem}</div></td>
                    <td role="cell" data-label="Penanggung jawab">{jamaahMap.get(row.task.picJamaahId)?.fullName ?? 'Warga tidak ditemukan'}</td>
                    <td role="cell" data-label="Batas tanggal">{row.task.dueDate
                      ? <span className={`badge ${row.overdue ? 'danger' : 'muted'}`}>{formatDate(row.task.dueDate)}{row.overdue ? ' · terlambat' : ''}</span>
                      : <span className="muted-copy">Tanpa batas</span>}</td>
                    <td role="cell" data-label="Asal musyawarah">{row.meeting.title}<div className="table-subtle">{formatDate(row.meeting.meetingDate)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<ListChecks size={20} />}
            title={openRows.length ? 'Tidak ada tugas untuk penanggung jawab ini' : 'Tidak ada tugas yang menunggu'}
            description={openRows.length ? 'Ganti pilihan penanggung jawab untuk melihat tugas lainnya.' : 'Semua tugas dari musyawarah yang tercatat sudah dicentang selesai.'}
          />
        )}
      </article>

      <article className="card">
        <div className="card-heading"><div><h2>Daftar Notulensi</h2><p>Tugas juga dapat dicentang atau dibatalkan dari sini.</p></div></div>
        <div className="meeting-list">
          {sortedMeetings.map((meeting) => {
            const summary = meetingSummary(meeting.id, meetingTopics, meetingTasks)
            const closed = isPeriodClosed(meeting.meetingDate.slice(0, 7))
            const topics = meetingTopics.filter((item) => item.meetingId === meeting.id).sort((a, b) => a.sortOrder - b.sortOrder)
            return (
              <section className="meeting-card" key={meeting.id}>
                <header>
                  <div>
                    <strong>{meeting.title}</strong>
                    <small>{formatDate(meeting.meetingDate)} · {summary.topicCount} masalah · {summary.doneCount} dari {summary.taskCount} tugas selesai</small>
                  </div>
                  <div className="meeting-card-actions">
                    {closed ? <span className="badge muted">Periode ditutup</span> : null}
                    <button className="icon-button" disabled={closed} onClick={() => openEdit(meeting)} aria-label="Edit notulensi"><Pencil size={15} /></button>
                    <button className="icon-button danger-icon" disabled={closed} onClick={() => void removeMeetingRecord(meeting)} aria-label="Hapus notulensi"><Trash2 size={15} /></button>
                  </div>
                </header>
                <div className="meeting-topics">
                  {topics.map((topic) => {
                    const tasks = meetingTasks.filter((item) => item.topicId === topic.id).sort((a, b) => a.sortOrder - b.sortOrder)
                    return (
                      <div className="meeting-topic" key={topic.id}>
                        <p className="meeting-problem">{topic.problem}</p>
                        <p className="meeting-solution">{topic.solution || 'Solusi belum dicatat.'}</p>
                        {tasks.length ? (
                          <ul className="meeting-task-list">
                            {tasks.map((task) => (
                              <li key={task.id} className={task.doneAt ? 'done' : ''}>
                                <label>
                                  <input type="checkbox" checked={Boolean(task.doneAt)} onChange={() => void toggleTask(task)} />
                                  <span>{task.task}</span>
                                </label>
                                <small>
                                  {jamaahMap.get(task.picJamaahId)?.fullName ?? 'Warga tidak ditemukan'}
                                  {task.dueDate ? ` · batas ${formatDate(task.dueDate)}` : ''}
                                </small>
                              </li>
                            ))}
                          </ul>
                        ) : <p className="muted-copy">Belum ada tugas untuk masalah ini.</p>}
                      </div>
                    )
                  })}
                  {!topics.length ? <p className="muted-copy">Notulensi ini belum memuat bahasan.</p> : null}
                </div>
              </section>
            )
          })}
          {!sortedMeetings.length ? (
            <EmptyState
              icon={<ClipboardList size={20} />}
              title="Belum ada notulensi musyawarah"
              description="Catat masalah yang dibahas, solusinya, dan tugas siapa supaya hasil musyawarah bisa ditagih pada pertemuan berikutnya."
              action={<button className="button primary" type="button" onClick={openCreate}><Plus size={16} /> Tambah Notulensi</button>}
            />
          ) : null}
        </div>
      </article>

      <Modal
        open={open}
        title={meetings.some((item) => item.id === header.id) ? 'Edit Notulensi Musyawarah' : 'Tambah Notulensi Musyawarah'}
        onClose={() => !saving && setOpen(false)}
        wide
        footer={<><button className="button outline" disabled={saving} onClick={() => setOpen(false)}>Batal</button><button className="button primary" disabled={saving || headerPeriodClosed} onClick={() => void submit()}>{saving ? 'Menyimpan…' : 'Simpan Notulensi'}</button></>}
      >
        <div className="form-grid">
          <label>Judul musyawarah *<input value={header.title} onChange={(event) => setHeader({ ...header, title: event.target.value })} placeholder="Contoh: Musyawarah Pengurus" /></label>
          <label>Tanggal musyawarah *<input type="date" max={today} value={header.meetingDate} onChange={(event) => setHeader({ ...header, meetingDate: event.target.value })} /></label>
        </div>
        {headerPeriodClosed ? <div className="form-error">Periode {header.meetingDate.slice(0, 7)} sudah ditutup. Buka kembali periode dari Laporan Bulanan untuk menyimpan notulensi bulan itu.</div> : null}

        <div className="family-member-heading"><div><strong>Masalah yang dibahas</strong><small>{topicDrafts.length} masalah</small></div><button className="button soft" type="button" onClick={() => setTopicDrafts([...topicDrafts, newTopicDraft()])}><Plus size={15} /> Tambah Masalah</button></div>

        <div className="topic-draft-list">
          {topicDrafts.map((topic, index) => (
            <section className="topic-draft" key={topic.id}>
              <header>
                <strong>Masalah {index + 1}</strong>
                {topicDrafts.length > 1 ? <button className="icon-button danger-icon" type="button" aria-label={`Hapus masalah ${index + 1}`} onClick={() => setTopicDrafts(topicDrafts.filter((item) => item.id !== topic.id))}><X size={15} /></button> : null}
              </header>
              <div className="form-grid one-column">
                <label>Masalah *<textarea rows={2} value={topic.problem} onChange={(event) => updateTopic(topic.id, { problem: event.target.value })} placeholder="Apa yang menjadi masalah" /></label>
                <label>Solusi<textarea rows={2} value={topic.solution} onChange={(event) => updateTopic(topic.id, { solution: event.target.value })} placeholder="Keputusan musyawarah atas masalah ini" /></label>
              </div>
              <div className="task-draft-head"><strong>Tugas</strong><button className="button soft small" type="button" onClick={() => updateTopic(topic.id, { tasks: [...topic.tasks, newTaskDraft()] })}><Plus size={14} /> Tambah Tugas</button></div>
              {topic.tasks.map((task) => (
                <div className="task-draft-row" key={task.id}>
                  <input value={task.task} onChange={(event) => updateTask(topic.id, task.id, { task: event.target.value })} placeholder="Tugas yang harus dikerjakan" aria-label="Tugas" />
                  <select value={task.picJamaahId} onChange={(event) => updateTask(topic.id, task.id, { picJamaahId: event.target.value })} aria-label="Penanggung jawab">
                    <option value="">Penanggung jawab…</option>
                    {picCandidates.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
                  </select>
                  <input type="date" value={task.dueDate} onChange={(event) => updateTask(topic.id, task.id, { dueDate: event.target.value })} aria-label="Batas tanggal" />
                  <button className="icon-button danger-icon" type="button" aria-label="Hapus tugas" onClick={() => updateTopic(topic.id, { tasks: topic.tasks.filter((item) => item.id !== task.id) })}><X size={15} /></button>
                </div>
              ))}
              {!topic.tasks.length ? <p className="muted-copy">Masalah ini belum punya tugas.</p> : null}
            </section>
          ))}
        </div>
        {modalError ? <div className="form-error">{modalError}</div> : null}
      </Modal>

      {confirmDialog}
    </>
  )
}
