import { AlertTriangle, CalendarCheck2, GraduationCap, MessageCircle, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { averageAttendanceRate, formatDate, jamaahSnapshotsAsOfDate, localIsoDate, materialDisplayName, materialProgressFor, monthEndDate, monthLabel, monthValue } from '../lib/utils'
import { buildAttendanceRisks, normalizeWhatsappNumber, type AttendanceRisk } from '../lib/followUps'
import { buildAbsenceInquiryMessage } from '../lib/followUpMessage'
import { preferredContactForJamaah } from '../lib/contacts'
import { buildMissedAttendance } from '../lib/missedAttendance'
import { openMeetingTaskRows } from '../lib/meetingTasks'
import { PageHeader, ProgressBlock, StatCard } from '../components/UI'
import { FollowUpModal } from '../components/FollowUpModal'

export function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
    classNameMap,
    classes,
    visibleClasses,
    visibleJamaah,
    jamaah,
    classHistory,
    statusHistory,
    schedules,
    attendanceSessions,
    materialCompletions,
    followUps,
    guardianContacts,
    meetings,
    meetingTopics,
    meetingTasks,
  } = useData()
  const [selectedMonth, setSelectedMonth] = useState(monthValue())
  const [followUpRisk, setFollowUpRisk] = useState<AttendanceRisk | null>(null)
  const classMap = useMemo(() => new Map(classes.map((item) => [item.id, item])), [classes])
  const visibleClassIds = useMemo(() => new Set(visibleClasses.map((item) => item.id)), [visibleClasses])

  const visibleSessions = attendanceSessions.filter((session) => visibleClassIds.has(session.classId) && session.date.startsWith(selectedMonth))
  const averageAttendance = averageAttendanceRate(visibleSessions)

  const upcomingSchedules = schedules
    .filter((schedule) => visibleClassIds.has(schedule.classId) && schedule.date >= localIsoDate())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)
  const materialSnapshot = useMemo(
    () => jamaahSnapshotsAsOfDate(jamaah, classHistory, statusHistory, monthEndDate(selectedMonth)),
    [classHistory, jamaah, selectedMonth, statusHistory],
  )

  const hasda = materialProgressFor('hasda', materialSnapshot, materialCompletions, selectedMonth, visibleClassIds, classNameMap)
  const asad = materialProgressFor('asad', materialSnapshot, materialCompletions, selectedMonth, visibleClassIds, classNameMap)
  const attendanceRisks = visibleClasses
    .flatMap((studyClass) => buildAttendanceRisks({ jamaah: visibleJamaah, sessions: attendanceSessions, followUps, classId: studyClass.id, month: selectedMonth }))
    .filter((risk) => (risk.followUp?.status ?? 'pending') !== 'resolved')
    .sort((a, b) => (a.level === b.level ? a.attendanceRate - b.attendanceRate : a.level === 'priority' ? -1 : 1))
  const topRisks = attendanceRisks.slice(0, 5)
  const missedAttendance = useMemo(
    () => buildMissedAttendance({ schedules, sessions: attendanceSessions, classIds: visibleClassIds }),
    [attendanceSessions, schedules, visibleClassIds],
  )
  const jamaahNameMap = useMemo(() => new Map(jamaah.map((item) => [item.id, item.fullName])), [jamaah])
  const openMeetingTasks = useMemo(
    () => openMeetingTaskRows(meetings, meetingTopics, meetingTasks, localIsoDate()),
    [meetingTasks, meetingTopics, meetings],
  )

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={<>
          <label className="month-filter">
            <span>Bulan</span>
            <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
          </label>
          <button className="button primary" onClick={() => navigate('/absensi')}>Isi Absensi</button>
        </>}
      />

      {missedAttendance.length ? (
        <article className="card dashboard-help dashboard-missed">
          <AlertTriangle size={22} />
          <div>
            <strong>{missedAttendance.length} jadwal sudah lewat tetapi belum diabsen</strong>
            <p>Terlama {formatDate(missedAttendance[missedAttendance.length - 1]!.schedule.date)} pada kelas {classMap.get(missedAttendance[missedAttendance.length - 1]!.schedule.classId)?.name ?? 'yang diampu'}. Rekap dan laporan bulanan akan bolong selama absensinya belum diisi.</p>
          </div>
          <button className="button primary small" type="button" onClick={() => navigate('/jadwal')}>Lihat &amp; isi</button>
        </article>
      ) : null}

      <section className="stats-grid three-columns">
        <StatCard tone="mint" label="Total Warga" value={visibleJamaah.length} icon={<Users size={20} />} />
        <StatCard tone="sky" label="Rata-Rata Kehadiran" value={`${averageAttendance}%`} icon={<CalendarCheck2 size={20} />} />
        <StatCard tone="violet" label="Kelas Dipantau" value={visibleClasses.length} icon={<GraduationCap size={20} />} />
      </section>

      <section className="dashboard-grid">
        <article className="card">
          <div className="card-heading">
            <div><h2>Target Materi Bulanan</h2></div>
            <button className="text-button" onClick={() => navigate('/materi')}>Kelola semua</button>
          </div>
          <div className="progress-list">
            <ProgressBlock title="Penyampaian Hasda" {...hasda} />
            <ProgressBlock title="Penyampaian ASAD" {...asad} />
          </div>
        </article>

        <article className="card">
          <div className="card-heading">
            <div><h2>Jadwal Terdekat</h2></div>
            <button className="text-button" onClick={() => navigate('/jadwal')}>Lihat semua</button>
          </div>
          <div className="schedule-list compact">
            {upcomingSchedules.length ? upcomingSchedules.map((schedule) => (
              <div className="schedule-row" key={schedule.id}>
                <span className="date-tile"><strong>{schedule.date.slice(8, 10)}</strong><small>{schedule.date.slice(5, 7)}</small></span>
                <span className="schedule-copy"><strong>{classMap.get(schedule.classId)?.name ?? 'Kelas'}</strong><small>{formatDate(schedule.date)} · {materialDisplayName(schedule.materialType, schedule.materialName)}</small></span>
                <button
                  className="button small primary"
                  onClick={() => { const params = new URLSearchParams({ class: schedule.classId, date: schedule.date, material: schedule.materialType }); if (schedule.materialName) params.set('materialName', schedule.materialName); if (schedule.notes) params.set('notes', schedule.notes); navigate(`/absensi?${params.toString()}`) }}
                >Absensi</button>
              </div>
            )) : <div className="empty-state">Belum ada jadwal mendatang.</div>}
          </div>
        </article>
      </section>

      <article className="card dashboard-followup">
        <div className="card-heading">
          <div><h2>Warga Perlu Perhatian</h2></div>
          <button className="text-button" onClick={() => navigate('/tindak-lanjut')}>Kelola semua</button>
        </div>
        <div className="dashboard-risk-list">
          {topRisks.map((risk) => {
            const className = classMap.get(risk.classId)?.name ?? 'Kelas'
            const contact = preferredContactForJamaah(risk.jamaah, guardianContacts, jamaah)
            const waNumber = contact ? normalizeWhatsappNumber(contact.phone) : ''
            const waText = encodeURIComponent(buildAbsenceInquiryMessage({
              jamaahName: risk.jamaah.fullName,
              className,
              monthLabel: monthLabel(selectedMonth),
              absentCount: risk.absentCount,
              consecutiveAbsence: risk.consecutiveAbsence,
              toGuardian: contact?.source === 'guardian',
            }))
            return (
              <div className="dashboard-risk-row" key={`${risk.classId}-${risk.jamaah.id}`}>
                <span>
                  <strong>{risk.jamaah.fullName}</strong>
                  <span className="dashboard-risk-meta">
                    <small>{className}</small>
                    <span className={`badge ${risk.level === 'priority' ? 'danger' : 'warning'}`}>Alpa {risk.absentCount}</span>
                  </span>
                </span>
                <div className="dashboard-risk-actions">
                  {waNumber ? (
                    <a className="button outline small" href={`https://wa.me/${waNumber}?text=${waText}`} target="_blank" rel="noreferrer" title={`WhatsApp ${contact?.relationship}: ${contact?.name}`}>
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                  ) : null}
                  <button className="button primary small" type="button" onClick={() => setFollowUpRisk(risk)}>Kelola</button>
                </div>
              </div>
            )
          })}
          {!topRisks.length ? <div className="empty-state">Belum ada warga yang memerlukan tindak lanjut.</div> : null}
        </div>
      </article>

      <FollowUpModal
        risk={followUpRisk}
        className={followUpRisk ? classMap.get(followUpRisk.classId)?.name ?? 'Kelas' : ''}
        onClose={() => setFollowUpRisk(null)}
      />

      {user?.role === 'superadmin' ? (
        <article className="card dashboard-followup">
          <div className="card-heading">
            <div><h2>Hasil Musyawarah Belum Selesai</h2></div>
            <button className="text-button" onClick={() => navigate('/musyawarah')}>Kelola semua</button>
          </div>
          <div className="dashboard-risk-list">
            {openMeetingTasks.slice(0, 5).map((row) => (
              <button type="button" key={row.task.id} onClick={() => navigate('/musyawarah')}>
                <span><strong>{row.task.task}</strong><small>{jamaahNameMap.get(row.task.picJamaahId) ?? 'Warga tidak ditemukan'} · {row.meeting.title}</small></span>
                {row.task.dueDate
                  ? <span className={`badge ${row.overdue ? 'danger' : 'muted'}`}>{row.overdue ? 'Terlambat' : formatDate(row.task.dueDate)}</span>
                  : <span className="badge muted">Tanpa batas</span>}
              </button>
            ))}
            {!openMeetingTasks.length ? <div className="empty-state">Tidak ada tugas musyawarah yang menunggu.</div> : null}
          </div>
        </article>
      ) : null}
    </>
  )
}
