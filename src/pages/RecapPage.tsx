import { Download, Eye, Pencil, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { PageHeader, Person, ProgressBlock, StatCard } from '../components/UI'
import { useData } from '../contexts/DataContext'
import { usePagination } from '../hooks/usePagination'
import { ATTENDANCE_LABELS } from '../lib/constants'
import {
  attendanceCounts,
  downloadCsv,
  formatDate,
  isEligibleForMaterial,
  jamaahSnapshotAsOfDate,
  monthEndDate,
  monthValue,
  percentage,
  materialDisplayName,
} from '../lib/utils'
import type { AttendanceSession } from '../types/domain'

export function RecapPage() {
  const navigate = useNavigate()
  const {
    classes,
    visibleClasses,
    jamaah,
    classHistory,
    statusHistory,
    attendanceSessions,
    materialCompletions,
    deleteAttendance,
    isPeriodClosed,
  } = useData()
  const [month, setMonth] = useState(monthValue())
  const [classId, setClassId] = useState('all')
  const [detail, setDetail] = useState<AttendanceSession | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const allowedIds = useMemo(() => new Set(visibleClasses.map((item) => item.id)), [visibleClasses])
  const classNameMap = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes])
  const sessions = attendanceSessions
    .filter((session) => allowedIds.has(session.classId) && session.date.startsWith(month) && (classId === 'all' || session.classId === classId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.savedAt.localeCompare(a.savedAt))

  const sessionPagination = usePagination(sessions, `${month}|${classId}`)
  const snapshotJamaah = useMemo(
    () => jamaah.map((person) => jamaahSnapshotAsOfDate(person, classHistory, statusHistory, monthEndDate(month))),
    [classHistory, jamaah, month, statusHistory],
  )

  const averageAttendance = sessions.length
    ? Math.round(
        sessions.reduce((sum, session) => {
          const counts = attendanceCounts(session.statuses)
          return sum + percentage(counts.present, Object.keys(session.statuses).length)
        }, 0) / sessions.length,
      )
    : 0

  function progressFor(materialType: 'hasda' | 'asad') {
    const participants = snapshotJamaah.filter(
      (person) => person.active && person.classIds.some((id) => allowedIds.has(id)) && isEligibleForMaterial(materialType, person, classNameMap),
    )
    const done = participants.filter((person) => materialCompletions.some((item) => item.month === month && item.materialType === materialType && item.jamaahId === person.id)).length
    return { done, total: participants.length, percent: percentage(done, participants.length) }
  }

  const hasda = progressFor('hasda')
  const asad = progressFor('asad')
  const pending = (hasda.total - hasda.done) + (asad.total - asad.done)

  async function remove(session: AttendanceSession) {
    const className = classNameMap.get(session.classId) ?? 'kelas ini'
    if (!window.confirm(`Hapus absensi ${className} tanggal ${formatDate(session.date)}?`)) return
    setMessage(null)
    try {
      await deleteAttendance(session.id)
      setMessage('Sesi absensi berhasil dihapus.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Gagal menghapus sesi.')
    }
  }

  function exportSessions() {
    downloadCsv('rekap-sesi-pengajian.csv', [
      ['Tanggal', 'Kelas', 'Materi', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Persentase Kehadiran'],
      ...sessions.map((session) => {
        const counts = attendanceCounts(session.statuses)
        const attendancePercent = percentage(counts.present, Object.keys(session.statuses).length)
        return [session.date, classNameMap.get(session.classId) ?? 'Kelas', materialDisplayName(session.materialType, session.materialName), counts.present, counts.excused, counts.sick, counts.absent, `${attendancePercent}%`]
      }),
    ])
  }

  const detailMembers = detail
    ? Object.entries(detail.statuses).map(([jamaahId, status]) => ({ person: jamaah.find((item) => item.id === jamaahId), status })).filter((item) => item.person)
    : []
  const detailCounts = detail ? attendanceCounts(detail.statuses) : null
  const detailTotal = detail ? Object.keys(detail.statuses).length : 0
  const detailAttendancePercentage = detailCounts ? percentage(detailCounts.present, detailTotal) : 0

  return (
    <>
      <PageHeader title="Rekap Keseluruhan Pengajian" description="Seluruh sesi kelas yang dapat diakses, termasuk Hasda dan ASAD." actions={<button className="button outline" onClick={exportSessions}><Download size={16} /> Ekspor Sesi CSV</button>} />

      <section className="stats-grid three-columns">
        <StatCard label="Total Sesi" value={sessions.length} note="Sesuai filter aktif" icon={<span>S</span>} />
        <StatCard label="Rata-Rata Hadir" value={`${averageAttendance}%`} note="Gabungan seluruh sesi" icon={<span>%</span>} />
        <StatCard label="Perlu Penyusulan" value={pending} note="Hasda/ASAD belum tuntas" icon={<span>!</span>} />
      </section>

      <article className="card">
        <div className="toolbar recap-toolbar">
          <label>Bulan<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          <label>Kelas<select value={classId} onChange={(event) => setClassId(event.target.value)}><option value="all">Semua kelas</option>{visibleClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <div className="session-list">
          {sessionPagination.pageItems.map((session) => {
            const counts = attendanceCounts(session.statuses)
            return (
              <article className="session-card" key={session.id}>
                <span className="date-tile"><strong>{session.date.slice(8, 10)}</strong><small>{session.date.slice(5, 7)}</small></span>
                <div className="session-copy">
                  <strong>{classNameMap.get(session.classId) ?? 'Kelas'}</strong>
                  <small>{formatDate(session.date)} · {materialDisplayName(session.materialType, session.materialName)}</small>
                  <div className="badge-list"><span className="badge success">Hadir {counts.present}</span><span className="badge info">Izin {counts.excused}</span><span className="badge warning">Sakit {counts.sick}</span><span className="badge danger">Alpa {counts.absent}</span></div>
                </div>
                <div className="session-actions">
                  <button className="button outline small" onClick={() => setDetail(session)}><Eye size={14} /> Detail</button>
                  <button className="button soft small" disabled={isPeriodClosed(session.date.slice(0, 7))} onClick={() => { const params = new URLSearchParams({ session: session.id, class: session.classId, date: session.date, material: session.materialType }); if (session.materialName) params.set('materialName', session.materialName); if (session.notes) params.set('notes', session.notes); navigate(`/absensi?${params.toString()}`) }}><Pencil size={14} /> Edit</button>
                  <button className="button danger small" disabled={isPeriodClosed(session.date.slice(0, 7))} onClick={() => void remove(session)}><Trash2 size={14} /> Hapus</button>
                </div>
              </article>
            )
          })}
          {!sessions.length ? <div className="empty-state">Belum ada sesi tersimpan pada filter ini.</div> : null}
        </div>
        <Pagination page={sessionPagination.page} pageSize={sessionPagination.pageSize} totalItems={sessions.length} onPageChange={sessionPagination.setPage} onPageSizeChange={sessionPagination.setPageSize} />
        {message ? <div className="inline-message">{message}</div> : null}
      </article>

      <article className="card">
        <div className="section-heading"><div><h2>Ringkasan Hasda & ASAD</h2><p>Ketuntasan materi pada bulan rekap yang sama.</p></div></div>
        <div className="progress-list two-columns"><ProgressBlock title="Penyampaian Hasda" {...hasda} /><ProgressBlock title="Penyampaian ASAD" {...asad} /></div>
      </article>

      <Modal open={Boolean(detail)} title="Detail Absensi Sesi" onClose={() => setDetail(null)} wide>
        {detail && detailCounts ? (
          <>
            <div className="detail-summary">
              <div>
                <strong>{classNameMap.get(detail.classId)}</strong>
                <span>{formatDate(detail.date)} · {materialDisplayName(detail.materialType, detail.materialName)}</span>{detail.notes ? <small className="detail-material-note">{detail.notes}</small> : null}
              </div>
              <div className="detail-attendance-rate">
                <small>Persentase Kehadiran</small>
                <strong>{detailAttendancePercentage}%</strong>
                <span>{detailCounts.present} hadir dari {detailTotal} peserta</span>
              </div>
            </div>
            <div className="detail-counts">
              <span className="badge success">Hadir {detailCounts.present}</span>
              <span className="badge info">Izin {detailCounts.excused}</span>
              <span className="badge warning">Sakit {detailCounts.sick}</span>
              <span className="badge danger">Alpa {detailCounts.absent}</span>
            </div>
            <div className="detail-list">
              {detailMembers.map(({ person, status }) => person ? (
                <div className="detail-row" key={person.id}>
                  <Person name={person.fullName} meta={person.censusCategory} />
                  <span className={`badge ${status === 'present' ? 'success' : status === 'excused' ? 'info' : status === 'sick' ? 'warning' : 'danger'}`}>{ATTENDANCE_LABELS[status]}</span>
                </div>
              ) : null)}
            </div>
          </>
        ) : null}
      </Modal>
    </>
  )
}
