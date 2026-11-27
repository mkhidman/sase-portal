import { CalendarClock, CircleCheck, ExternalLink, MessageCircle, Search, TriangleAlert, UserRoundCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FollowUpModal } from '../components/FollowUpModal'
import { EmptyState, InlineMessage, PageHeader, Person, StatCard } from '../components/UI'
import { MonthField } from '../components/MonthField'
import { type Feedback } from '../lib/feedback'
import { useData } from '../contexts/DataContext'
import { FOLLOW_UP_STATUS_LABELS } from '../lib/constants'
import { buildAttendanceRisks, normalizeWhatsappNumber, type AttendanceRisk } from '../lib/followUps'
import { preferredContactForJamaah } from '../lib/contacts'
import { buildAbsenceInquiryMessage } from '../lib/followUpMessage'
import { formatDate, jamaahSnapshotsAsOfDate, localIsoDate, monthEndDate, monthLabel, monthValue } from '../lib/utils'
import type { FollowUpStatus } from '../types/domain'

const STATUS_OPTIONS: FollowUpStatus[] = ['pending', 'contacted', 'visit_needed', 'resolved']

function statusBadge(status: FollowUpStatus): string {
  if (status === 'resolved') return 'success'
  if (status === 'visit_needed') return 'danger'
  if (status === 'contacted') return 'info'
  return 'warning'
}

export function FollowUpsPage() {
  const {
    classNameMap,
    visibleClasses,
    jamaah,
    classHistory,
    statusHistory,
    attendanceSessions,
    followUps,
    guardianContacts,
    isPeriodClosed,
  } = useData()
  const [searchParams] = useSearchParams()
  const [month, setMonth] = useState(monthValue())
  const [classId, setClassId] = useState(searchParams.get('class') ?? visibleClasses[0]?.id ?? '')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | FollowUpStatus>('open')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AttendanceRisk | null>(null)
  const [message, setMessage] = useState<Feedback | null>(null)

  const effectiveClassId = visibleClasses.some((item) => item.id === classId) ? classId : visibleClasses[0]?.id ?? ''
  const snapshotJamaah = useMemo(
    () => jamaahSnapshotsAsOfDate(jamaah, classHistory, statusHistory, monthEndDate(month)),
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
    setMessage(null)
  }

  return (
    <>
      <PageHeader title="Pemantauan & Tindak Lanjut" description="Warga mulai masuk daftar tinjauan setelah tercatat minimal 4 kali Alpa dalam bulan yang dipilih." />

      {periodClosed ? <div className="notice danger-notice">Periode bulan ini sudah ditutup. Catatan tindak lanjut hanya dapat dilihat.</div> : null}

      <section className="stats-grid three-columns">
        <StatCard tone="sky" label="Perlu Ditindaklanjuti" value={openCount} icon={<UserRoundCheck size={20} />} />
        <StatCard tone="amber" label="Prioritas" value={priorityCount} icon={<TriangleAlert size={20} />} />
        <StatCard tone="amber" label="Jatuh Tempo" value={dueCount} icon={<CalendarClock size={20} />} />
      </section>

      <article className="card">
        <div className="followup-filters">
          <label>Bulan<MonthField value={month} onChange={setMonth} /></label>
          <label>Kelas<select value={effectiveClassId} onChange={(event) => setClassId(event.target.value)}>{visibleClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="open">Belum selesai</option><option value="all">Semua status</option>{STATUS_OPTIONS.map((status) => <option value={status} key={status}>{FOLLOW_UP_STATUS_LABELS[status]}</option>)}</select></label>
        </div>
        <label className="search-field followup-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama warga…" /></label>

        <div className="followup-list">
          {risks.map((risk) => {
            const status = risk.followUp?.status ?? 'pending'
            const preferredContact = preferredContactForJamaah(risk.jamaah, guardianContacts, jamaah)
            const waNumber = preferredContact ? normalizeWhatsappNumber(preferredContact.phone) : ''
            const waText = encodeURIComponent(buildAbsenceInquiryMessage({
              jamaahName: risk.jamaah.fullName,
              className: classNameMap.get(risk.classId) ?? 'Kelas',
              monthLabel: monthLabel(risk.month),
              absentCount: risk.absentCount,
              consecutiveAbsence: risk.consecutiveAbsence,
              toGuardian: preferredContact?.source === 'guardian',
            }))
            return (
              <article className={`followup-card ${risk.level === 'priority' ? 'priority' : ''}`} key={`${risk.classId}-${risk.jamaah.id}`}>
                <div className="followup-main">
                  <Person name={risk.jamaah.fullName} meta={`${risk.jamaah.censusCategory} · ${classNameMap.get(risk.classId) ?? 'Kelas'}`} />
                  <div className="followup-metrics">
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
                  {waNumber ? <a className="button outline small" href={`https://wa.me/${waNumber}?text=${waText}`} target="_blank" rel="noreferrer" title={preferredContact ? `${preferredContact.relationship}: ${preferredContact.name}` : undefined}><MessageCircle size={14} /> {preferredContact?.source === 'guardian' ? 'WhatsApp Wali' : 'WhatsApp'} <ExternalLink size={12} /></a> : null}
                  <button className="button primary small" type="button" disabled={periodClosed} onClick={() => openFollowUp(risk)}>Kelola</button>
                </div>
              </article>
            )
          })}
          {!risks.length ? <EmptyState icon={<CircleCheck size={20} />} title="Tidak ada yang perlu ditindaklanjuti" description="Pada bulan dan kelas ini belum ada warga yang memenuhi ambang tinjauan. Ubah filter di atas untuk memeriksa periode lain." /> : null}
        </div>
        <InlineMessage value={message} />
      </article>

      <FollowUpModal
        risk={selected}
        className={selected ? classNameMap.get(selected.classId) ?? 'Kelas' : ''}
        onClose={() => setSelected(null)}
        onSaved={setMessage}
      />
    </>
  )
}
