import { CalendarClock, CircleCheck, ExternalLink, MessageCircle, Search, Trash2, TriangleAlert, UserRoundCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { useConfirm } from '../components/useConfirm'
import { EmptyState, InlineMessage, PageHeader, Person, StatCard } from '../components/UI'
import { feedbackFrom, feedbackOk, type Feedback } from '../lib/feedback'
import { useData } from '../contexts/DataContext'
import { FOLLOW_UP_STATUS_LABELS } from '../lib/constants'
import { buildAttendanceRisks, normalizeWhatsappNumber, type AttendanceRisk } from '../lib/followUps'
import { preferredContactForJamaah } from '../lib/contacts'
import { formatDate, jamaahSnapshotAsOfDate, localIsoDate, monthEndDate, monthValue } from '../lib/utils'
import type { FollowUpStatus, JamaahFollowUp } from '../types/domain'

const STATUS_OPTIONS: FollowUpStatus[] = ['pending', 'contacted', 'visit_needed', 'resolved']

function statusBadge(status: FollowUpStatus): string {
  if (status === 'resolved') return 'success'
  if (status === 'visit_needed') return 'danger'
  if (status === 'contacted') return 'info'
  return 'warning'
}

export function FollowUpsPage() {
  const {
    classes,
    visibleClasses,
    jamaah,
    classHistory,
    statusHistory,
    attendanceSessions,
    followUps,
    guardianContacts,
    saveJamaahFollowUp,
    deleteJamaahFollowUp,
    isPeriodClosed,
  } = useData()
  const [searchParams] = useSearchParams()
  const [month, setMonth] = useState(monthValue())
  const [classId, setClassId] = useState(searchParams.get('class') ?? visibleClasses[0]?.id ?? '')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | FollowUpStatus>('open')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AttendanceRisk | null>(null)
  const [form, setForm] = useState({ status: 'pending' as FollowUpStatus, notes: '', nextFollowUpDate: '' })
  const [message, setMessage] = useState<Feedback | null>(null)
  const [working, setWorking] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirm()

  const effectiveClassId = visibleClasses.some((item) => item.id === classId) ? classId : visibleClasses[0]?.id ?? ''
  const classMap = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes])
  const snapshotJamaah = useMemo(
    () => jamaah.map((person) => jamaahSnapshotAsOfDate(person, classHistory, statusHistory, monthEndDate(month))),
    [classHistory, jamaah, month, statusHistory],
  )
  const allRisks = useMemo(() => buildAttendanceRisks({
    jamaah: snapshotJamaah,
    sessions: attendanceSessions,
    followUps,
    classId: effectiveClassId,
    month,
  }), [attendanceSessions, effectiveClassId, followUps, month, snapshotJamaah])

  const risks = allRisks.filter((risk) => {
    const status = risk.followUp?.status ?? 'pending'
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'open' ? status !== 'resolved' : status === statusFilter)
    return matchesStatus && risk.jamaah.fullName.toLowerCase().includes(search.toLowerCase())
  })

  const periodClosed = isPeriodClosed(month)

  const openCount = allRisks.filter((risk) => (risk.followUp?.status ?? 'pending') !== 'resolved').length
  const priorityCount = allRisks.filter((risk) => risk.level === 'priority' && (risk.followUp?.status ?? 'pending') !== 'resolved').length
  const dueCount = allRisks.filter((risk) => risk.followUp?.nextFollowUpDate && risk.followUp.nextFollowUpDate <= localIsoDate() && risk.followUp.status !== 'resolved').length

  function openFollowUp(risk: AttendanceRisk) {
    setSelected(risk)
    setForm({
      status: risk.followUp?.status ?? 'pending',
      notes: risk.followUp?.notes ?? '',
      nextFollowUpDate: risk.followUp?.nextFollowUpDate ?? '',
    })
    setMessage(null)
  }

  async function save() {
    if (!selected) return
    setWorking(true)
    setMessage(null)
    try {
      const now = new Date().toISOString()
      const followUp: JamaahFollowUp = {
        id: selected.followUp?.id ?? `new-${crypto.randomUUID()}`,
        jamaahId: selected.jamaah.id,
        classId: selected.classId,
        periodMonth: selected.month,
        status: form.status,
        triggerType: selected.consecutiveAbsence >= 4 ? 'consecutive_absence' : 'manual',
        attendanceRate: selected.attendanceRate,
        absenceCount: selected.absentCount,
        consecutiveAbsence: selected.consecutiveAbsence,
        notes: form.notes.trim(),
        nextFollowUpDate: form.status === 'resolved' ? '' : form.nextFollowUpDate,
        recordedBy: selected.followUp?.recordedBy ?? null,
        createdAt: selected.followUp?.createdAt ?? now,
        updatedAt: now,
      }
      await saveJamaahFollowUp(followUp)
      setSelected(null)
      setMessage(feedbackOk('Tindak lanjut berhasil disimpan.'))
    } catch (cause) {
      setMessage(feedbackFrom(cause, 'Gagal menyimpan tindak lanjut.'))
    } finally {
      setWorking(false)
    }
  }

  async function remove() {
    if (!selected?.followUp) return
    const approved = await confirm({
      title: 'Hapus catatan tindak lanjut?',
      description: `Catatan tindak lanjut untuk ${selected.jamaah.fullName} akan dihapus. Riwayat kehadirannya tidak ikut terhapus.`,
      confirmLabel: 'Hapus Catatan',
      tone: 'danger',
    })
    if (!approved) return
    setWorking(true)
    try {
      await deleteJamaahFollowUp(selected.followUp.id)
      setSelected(null)
      setMessage(feedbackOk('Catatan tindak lanjut berhasil dihapus.'))
    } catch (cause) {
      setMessage(feedbackFrom(cause, 'Gagal menghapus tindak lanjut.'))
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <PageHeader title="Pemantauan & Tindak Lanjut" description="Warga mulai masuk daftar tinjauan setelah tercatat minimal 4 kali Alpa dalam bulan yang dipilih." />

      {periodClosed ? <div className="notice danger-notice">Periode bulan ini sudah ditutup. Catatan tindak lanjut hanya dapat dilihat.</div> : null}

      <section className="stats-grid three-columns">
        <StatCard label="Perlu Ditindaklanjuti" value={openCount} note="Belum berstatus selesai" icon={<UserRoundCheck size={20} />} />
        <StatCard label="Prioritas" value={priorityCount} note="Alpa ≥6 kali atau 4 sesi beruntun" icon={<TriangleAlert size={20} />} />
        <StatCard label="Jatuh Tempo" value={dueCount} note="Tanggal tindak lanjut hari ini/lewat" icon={<CalendarClock size={20} />} />
      </section>

      <article className="card">
        <div className="followup-filters">
          <label>Bulan<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          <label>Kelas<select value={effectiveClassId} onChange={(event) => setClassId(event.target.value)}>{visibleClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="open">Belum selesai</option><option value="all">Semua status</option>{STATUS_OPTIONS.map((status) => <option value={status} key={status}>{FOLLOW_UP_STATUS_LABELS[status]}</option>)}</select></label>
        </div>
        <label className="search-field followup-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama warga…" /></label>

        <div className="followup-list">
          {risks.map((risk) => {
            const status = risk.followUp?.status ?? 'pending'
            const preferredContact = preferredContactForJamaah(risk.jamaah, guardianContacts, jamaah)
            const waNumber = preferredContact ? normalizeWhatsappNumber(preferredContact.phone) : ''
            return (
              <article className={`followup-card ${risk.level === 'priority' ? 'priority' : ''}`} key={`${risk.classId}-${risk.jamaah.id}`}>
                <div className="followup-main">
                  <Person name={risk.jamaah.fullName} meta={`${risk.jamaah.censusCategory} · ${classMap.get(risk.classId) ?? 'Kelas'}`} />
                  <div className="followup-metrics">
                    <span><small>Kehadiran</small><strong>{risk.attendanceRate}%</strong></span>
                    <span><small>Hadir</small><strong>{risk.presentCount}/{risk.totalSessions}</strong></span>
                    <span><small>Alpa</small><strong>{risk.absentCount}</strong></span>
                    <span><small>Beruntun</small><strong>{risk.consecutiveAbsence}</strong></span>
                  </div>
                  <div className="badge-list">
                    <span className={`badge ${statusBadge(status)}`}>{FOLLOW_UP_STATUS_LABELS[status]}</span>
                    {risk.reasons.map((reason) => <span className="badge muted" key={reason}>{reason}</span>)}
                    {risk.followUp?.nextFollowUpDate ? <span className="badge info">Berikutnya {formatDate(risk.followUp.nextFollowUpDate)}</span> : null}
                  </div>
                </div>
                <div className="followup-actions">
                  {waNumber ? <a className="button outline small" href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" title={preferredContact ? `${preferredContact.relationship}: ${preferredContact.name}` : undefined}><MessageCircle size={14} /> {preferredContact?.source === 'guardian' ? 'WhatsApp Wali' : 'WhatsApp'} <ExternalLink size={12} /></a> : null}
                  <button className="button primary small" type="button" disabled={periodClosed} onClick={() => openFollowUp(risk)}>Kelola</button>
                </div>
              </article>
            )
          })}
          {!risks.length ? <EmptyState icon={<CircleCheck size={20} />} title="Tidak ada yang perlu ditindaklanjuti" description="Pada bulan dan kelas ini belum ada warga yang memenuhi ambang tinjauan. Ubah filter di atas untuk memeriksa periode lain." /> : null}
        </div>
        <InlineMessage value={message} />
      </article>

      <Modal open={Boolean(selected)} title="Catatan Tindak Lanjut" onClose={() => setSelected(null)} wide>
        {selected ? (
          <>
            <div className="followup-modal-summary">
              <Person name={selected.jamaah.fullName} meta={`${classMap.get(selected.classId) ?? 'Kelas'} · Kehadiran ${selected.attendanceRate}%`} />
              <div className="badge-list">{selected.reasons.map((reason) => <span className="badge warning" key={reason}>{reason}</span>)}</div>
            </div>
            <div className="form-grid one-column">
              <label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FollowUpStatus }))}>{STATUS_OPTIONS.map((status) => <option value={status} key={status}>{FOLLOW_UP_STATUS_LABELS[status]}</option>)}</select></label>
              <label>Tanggal tindak lanjut berikutnya<input type="date" disabled={form.status === 'resolved'} value={form.status === 'resolved' ? '' : form.nextFollowUpDate} onChange={(event) => setForm((current) => ({ ...current, nextFollowUpDate: event.target.value }))} /></label>
              <label>Catatan<textarea rows={5} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Contoh: sudah menghubungi wali, warga sedang sakit, rencana kunjungan…" /></label>
            </div>
            <div className="modal-inline-actions">
              {selected.followUp ? <button className="button danger" type="button" disabled={working || periodClosed} onClick={() => void remove()}><Trash2 size={15} /> Hapus Catatan</button> : <span />}
              <div><button className="button outline" type="button" onClick={() => setSelected(null)}>Batal</button><button className="button primary" type="button" disabled={working || periodClosed} onClick={() => void save()}>{working ? 'Menyimpan…' : 'Simpan Tindak Lanjut'}</button></div>
            </div>
          </>
        ) : null}
      </Modal>
      {confirmDialog}
    </>
  )
}
