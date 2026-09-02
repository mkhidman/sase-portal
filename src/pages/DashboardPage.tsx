import { AlertTriangle, BookOpenCheck, CalendarCheck2, GraduationCap, ShieldCheck, UserRoundCheck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { attendanceCounts, formatDate, isEligibleForMaterial, jamaahSnapshotAsOfDate, localIsoDate, materialDisplayName, monthEndDate, monthValue, percentage } from '../lib/utils'
import { buildAttendanceRisks } from '../lib/followUps'
import { buildMissedAttendance } from '../lib/missedAttendance'
import { analyzeDataQuality } from '../lib/dataQuality'
import { PageHeader, ProgressBlock, StatCard } from '../components/UI'

export function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
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
    loading,
  } = useData()
  const [selectedMonth, setSelectedMonth] = useState(monthValue())
  const classMap = useMemo(() => new Map(classes.map((item) => [item.id, item])), [classes])
  const classNameMap = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes])
  const visibleClassIds = useMemo(() => new Set(visibleClasses.map((item) => item.id)), [visibleClasses])

  const visibleSessions = attendanceSessions.filter((session) => visibleClassIds.has(session.classId))
  const averageAttendance = visibleSessions.length
    ? Math.round(
        visibleSessions.reduce((total, session) => {
          const counts = attendanceCounts(session.statuses)
          return total + percentage(counts.present, Object.keys(session.statuses).length)
        }, 0) / visibleSessions.length,
      )
    : 0

  const upcomingSchedules = schedules
    .filter((schedule) => visibleClassIds.has(schedule.classId) && schedule.date >= localIsoDate())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)
  const materialSnapshot = useMemo(
    () => jamaah.map((person) => jamaahSnapshotAsOfDate(person, classHistory, statusHistory, monthEndDate(selectedMonth))),
    [classHistory, jamaah, selectedMonth, statusHistory],
  )

  function materialProgress(material: 'hasda' | 'asad') {
    const participants = materialSnapshot.filter(
      (person) => person.active && person.classIds.some((id) => visibleClassIds.has(id)) && isEligibleForMaterial(material, person, classNameMap),
    )
    const done = participants.filter((person) =>
      materialCompletions.some(
        (completion) => completion.month === selectedMonth && completion.materialType === material && completion.jamaahId === person.id,
      ),
    ).length
    return { total: participants.length, done, percent: percentage(done, participants.length) }
  }

  const hasda = materialProgress('hasda')
  const asad = materialProgress('asad')
  const currentMonth = monthValue()
  const attendanceRisks = visibleClasses
    .flatMap((studyClass) => buildAttendanceRisks({ jamaah: visibleJamaah, sessions: attendanceSessions, followUps, classId: studyClass.id, month: currentMonth }))
    .filter((risk) => (risk.followUp?.status ?? 'pending') !== 'resolved')
    .sort((a, b) => (a.level === b.level ? a.attendanceRate - b.attendanceRate : a.level === 'priority' ? -1 : 1))
  const topRisks = attendanceRisks.slice(0, 5)
  const missedAttendance = useMemo(
    () => buildMissedAttendance({ schedules, sessions: attendanceSessions, classIds: visibleClassIds }),
    [attendanceSessions, schedules, visibleClassIds],
  )
  const dataQuality = useMemo(
    () => analyzeDataQuality(visibleJamaah, classes, guardianContacts),
    [classes, guardianContacts, visibleJamaah],
  )
  const criticalDataIssues = dataQuality.issues.filter((issue) => issue.severity === 'critical').length

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Ringkasan operasional kelas, kehadiran, dan target materi."
        actions={<button className="button primary" onClick={() => navigate('/absensi')}>Isi Absensi</button>}
      />

      {loading ? <div className="notice">Memuat data…</div> : null}

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
        <StatCard label="Total Warga" value={visibleJamaah.length} note="Sesuai hak akses pengguna" icon={<Users size={20} />} />
        <StatCard label="Rata-Rata Kehadiran" value={`${averageAttendance}%`} note={`${visibleSessions.length} sesi tersimpan`} icon={<CalendarCheck2 size={20} />} />
        <StatCard label="Kelas Dipantau" value={visibleClasses.length} note="Kelas yang dapat diakses" icon={<GraduationCap size={20} />} />
      </section>

      <section className="dashboard-grid">
        <article className="card">
          <div className="card-heading">
            <div><h2>Target Materi Bulanan</h2><p>Ketuntasan Hasda dan ASAD pada bulan yang dipilih.</p></div>
            <label className="month-filter">
              <span>Bulan</span>
              <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
            </label>
          </div>
          <div className="progress-list">
            <ProgressBlock title="Penyampaian Hasda" {...hasda} />
            <ProgressBlock title="Penyampaian ASAD" {...asad} />
          </div>
        </article>

        <article className="card">
          <div className="card-heading">
            <div><h2>Jadwal Terdekat</h2><p>Hanya hari ini dan tanggal berikutnya.</p></div>
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

      {user?.role === 'superadmin' ? (
        <article className="card dashboard-data-quality">
          <div className="dashboard-help">
            <ShieldCheck size={22} />
            <div><strong>Kualitas data {dataQuality.completenessPercent}%</strong><p>{criticalDataIssues ? `${criticalDataIssues} temuan kritis perlu dibereskan sebelum pilot penuh.` : `${dataQuality.peopleWithIssues} warga masih memiliki data yang perlu dilengkapi.`}</p></div>
            <button className="button outline small" type="button" onClick={() => navigate('/kualitas-data')}>Periksa data</button>
          </div>
        </article>
      ) : null}

      <article className="card dashboard-followup">
        <div className="card-heading">
          <div><h2>Warga Perlu Perhatian</h2><p>Deteksi kehadiran rendah dan Alpa berulang pada bulan berjalan.</p></div>
          <button className="text-button" onClick={() => navigate('/tindak-lanjut')}>Kelola semua</button>
        </div>
        <div className="dashboard-risk-list">
          {topRisks.map((risk) => (
            <button type="button" key={`${risk.classId}-${risk.jamaah.id}`} onClick={() => navigate(`/tindak-lanjut?class=${risk.classId}`)}>
              <span><strong>{risk.jamaah.fullName}</strong><small>{classMap.get(risk.classId)?.name ?? 'Kelas'} · {risk.reasons[0]}</small></span>
              <span className={`badge ${risk.level === 'priority' ? 'danger' : 'warning'}`}>{risk.attendanceRate}%</span>
            </button>
          ))}
          {!topRisks.length ? <div className="empty-state">Belum ada warga yang memerlukan tindak lanjut.</div> : null}
        </div>
      </article>

      <article className="card dashboard-help">
        <BookOpenCheck size={22} />
        <div><strong>Ketuntasan materi tidak sama dengan kehadiran sesi.</strong><p>Peserta yang tidak hadir tetap dapat ditandai tuntas melalui penyusulan mandiri tanpa mengubah status absensi awal.</p></div>
        <span className="badge muted"><UserRoundCheck size={12} /> {attendanceRisks.length} perlu perhatian</span>
      </article>
    </>
  )
}
