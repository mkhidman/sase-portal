import { CheckCircle2, Clock3, ExternalLink, ListChecks, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { InlineMessage, PageHeader, Person, StatCard } from '../components/UI'
import { feedbackFrom, feedbackOk, type Feedback } from '../lib/feedback'
import { useData } from '../contexts/DataContext'
import { formatDate, localIsoDate } from '../lib/utils'
import type { MeetingActionStatus } from '../types/domain'

const STATUS_LABELS: Record<MeetingActionStatus, string> = {
  pending: 'Belum mulai',
  in_progress: 'Berjalan',
  completed: 'Selesai',
}

function badgeClass(status: MeetingActionStatus, overdue: boolean): string {
  if (status === 'completed') return 'success'
  if (overdue) return 'danger'
  return status === 'in_progress' ? 'info' : 'warning'
}

export function MeetingFollowUpsPage() {
  const navigate = useNavigate()
  const { jamaah, meetingNotes, meetingActions, visibleJamaah, saveMeetingNote } = useData()
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | MeetingActionStatus>('open')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [message, setMessage] = useState<Feedback | null>(null)
  const jamaahMap = useMemo(() => new Map(jamaah.map((item) => [item.id, item])), [jamaah])
  const noteMap = useMemo(() => new Map(meetingNotes.map((item) => [item.id, item])), [meetingNotes])
  const assignees = useMemo(() => visibleJamaah.filter((item) => meetingActions.some((action) => action.assigneeJamaahId === item.id)).sort((a, b) => a.fullName.localeCompare(b.fullName, 'id')), [meetingActions, visibleJamaah])
  const openCount = meetingActions.filter((item) => item.status !== 'completed').length
  const overdueCount = meetingActions.filter((item) => item.status !== 'completed' && item.dueDate && item.dueDate < localIsoDate()).length
  const completedCount = meetingActions.filter((item) => item.status === 'completed').length

  const filteredActions = meetingActions.filter((action) => {
    const note = noteMap.get(action.meetingNoteId)
    const assigneeName = action.assigneeJamaahId ? jamaahMap.get(action.assigneeJamaahId)?.fullName ?? '' : ''
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'open' ? action.status !== 'completed' : action.status === statusFilter)
    const matchesAssignee = assigneeFilter === 'all' || action.assigneeJamaahId === assigneeFilter
    const haystack = `${action.task} ${note?.title ?? ''} ${assigneeName}`.toLowerCase()
    return matchesStatus && matchesAssignee && haystack.includes(search.toLowerCase())
  })

  async function changeStatus(actionId: string, status: MeetingActionStatus) {
    const action = meetingActions.find((item) => item.id === actionId)
    const note = action ? noteMap.get(action.meetingNoteId) : null
    if (!action || !note) return
    setWorkingId(actionId)
    setMessage(null)
    try {
      await saveMeetingNote({ note, actions: meetingActions.filter((item) => item.meetingNoteId === note.id).map((item) => item.id === action.id ? { ...item, status } : { ...item }) })
      setMessage(feedbackOk('Status tindak lanjut berhasil diperbarui.'))
    } catch (cause) {
      setMessage(feedbackFrom(cause, 'Gagal memperbarui status.'))
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <>
      <PageHeader title="Tindak Lanjut Musyawarah" description="Pantau seluruh tugas dari keputusan musyawarah dalam satu halaman." />
      <section className="stats-grid three-columns"><StatCard label="Belum Selesai" value={openCount} note="Masih perlu dikerjakan" icon={<ListChecks size={20} />} /><StatCard label="Terlambat" value={overdueCount} note="Melewati tenggat" icon={<Clock3 size={20} />} /><StatCard label="Selesai" value={completedCount} note="Sudah ditutup" icon={<CheckCircle2 size={20} />} /></section>
      <article className="card"><div className="toolbar meeting-followup-toolbar"><label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="open">Belum selesai</option><option value="all">Semua status</option><option value="pending">Belum mulai</option><option value="in_progress">Berjalan</option><option value="completed">Selesai</option></select></label><label>Penanggung jawab<select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="all">Semua penanggung jawab</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari tugas atau notulensi..." /></label></div><div className="meeting-followup-table">{filteredActions.map((action) => { const note = noteMap.get(action.meetingNoteId); const overdue = Boolean(action.dueDate && action.dueDate < localIsoDate() && action.status !== 'completed'); const person = action.assigneeJamaahId ? jamaahMap.get(action.assigneeJamaahId) : null; return <div className="meeting-followup-row" key={action.id}><div className="meeting-followup-task"><strong>{action.task}</strong><small>{note?.title ?? 'Notulensi tidak ditemukan'}</small></div><div>{person ? <Person name={person.fullName} meta={person.censusCategory} /> : <span className="field-help">Belum ditentukan</span>}</div><div className={overdue ? 'overdue-date' : undefined}>{action.dueDate ? formatDate(action.dueDate) : 'Tanpa tenggat'}</div><select className={`status-select ${badgeClass(action.status, overdue)}`} value={action.status} disabled={workingId === action.id} onChange={(event) => void changeStatus(action.id, event.target.value as MeetingActionStatus)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="button outline small" type="button" onClick={() => note && navigate(`/notulensi?id=${encodeURIComponent(note.id)}`)}><ExternalLink size={13} /> Buka</button></div> })}{!filteredActions.length ? <div className="empty-state">Tidak ada tindak lanjut sesuai filter.</div> : null}</div><InlineMessage value={message} /></article>
    </>
  )
}
