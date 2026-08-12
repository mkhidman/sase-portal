import { ClipboardList, Download, FileCheck2, Lock, LockOpen, Percent, TriangleAlert, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { PageHeader, StatCard } from '../components/UI'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { usePagination } from '../hooks/usePagination'
import { CENSUS_CATEGORIES, FOLLOW_UP_STATUS_LABELS } from '../lib/constants'
import { attendanceCounts, isEligibleForMaterial, jamaahSnapshotAsOfDate, monthEndDate, monthValue, percentage } from '../lib/utils'
import { downloadMonthlyReportPdf } from '../lib/monthlyReportPdf'
import type { AttendanceStatus } from '../types/domain'

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))
}

export function MonthlyReportPage() {
  const { user } = useAuth()
  const {
    classes,
    visibleClasses,
    jamaah,
    attendanceSessions,
    materialCompletions,
    followUps,
    reportingPeriods,
    classHistory,
    statusHistory,
    setReportingPeriodStatus,
  } = useData()
  const [month, setMonth] = useState(monthValue())
  const [classId, setClassId] = useState('all')
  const [periodModal, setPeriodModal] = useState<'close' | 'open' | null>(null)
  const [periodNote, setPeriodNote] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const classMap = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes])
  const selectedClasses = visibleClasses.filter((item) => classId === 'all' || item.id === classId)
  const snapshotDate = monthEndDate(month)
  const snapshotJamaah = jamaah.map((person) =>
    jamaahSnapshotAsOfDate(person, classHistory, statusHistory, snapshotDate),
  )
  const selectedClassIds = new Set(selectedClasses.map((item) => item.id))
  const censusPopulation = snapshotJamaah.filter((person) => {
    if (!person.active) return false
    if (classId !== 'all') return person.classIds.includes(classId)
    if (user?.role === 'superadmin') return true
    return person.classIds.some((id) => selectedClassIds.has(id))
  })
  const censusGenderSummary = CENSUS_CATEGORIES.map((categoryName) => {
    const members = censusPopulation.filter((person) => person.censusCategory === categoryName)
    const male = members.filter((person) => person.gender === 'Laki-laki').length
    const female = members.filter((person) => person.gender === 'Perempuan').length
    return { categoryName, male, female, total: members.length }
  })
  const sessions = attendanceSessions.filter((item) => item.date.startsWith(month) && selectedClassIds.has(item.classId))
  const period = reportingPeriods.find((item) => item.month === month)
  const closed = period?.status === 'closed'

  const totalRecords = sessions.reduce((sum, session) => sum + Object.keys(session.statuses).length, 0)
  const totalPresent = sessions.reduce((sum, session) => sum + attendanceCounts(session.statuses).present, 0)
  const averageAttendance = percentage(totalPresent, totalRecords)
  const uniqueJamaah = new Set(sessions.flatMap((session) => Object.keys(session.statuses))).size
  const openFollowUps = followUps.filter((item) => item.periodMonth === month && selectedClassIds.has(item.classId) && item.status !== 'resolved').length

  const classReports = selectedClasses.map((studyClass) => {
    const classSessions = sessions.filter((item) => item.classId === studyClass.id)
    const members = snapshotJamaah.filter((person) => person.active && person.classIds.includes(studyClass.id))
    const totals = classSessions.reduce(
      (result, session) => {
        const counts = attendanceCounts(session.statuses)
        result.present += counts.present
        result.excused += counts.excused
        result.sick += counts.sick
        result.absent += counts.absent
        return result
      },
      { present: 0, excused: 0, sick: 0, absent: 0 },
    )
    const recorded = totals.present + totals.excused + totals.sick + totals.absent
    const materialProgress = (materialType: 'hasda' | 'asad') => {
      const eligible = members.filter((person) => isEligibleForMaterial(materialType, person, classMap))
      const done = eligible.filter((person) => materialCompletions.some((item) => item.month === month && item.materialType === materialType && item.jamaahId === person.id)).length
      return { total: eligible.length, done, percent: eligible.length ? percentage(done, eligible.length) : null }
    }
    return {
      classId: studyClass.id,
      className: studyClass.name,
      members,
      sessions: classSessions,
      totals,
      attendanceRate: percentage(totals.present, recorded),
      hasda: materialProgress('hasda'),
      asad: materialProgress('asad'),
      openFollowUps: followUps.filter((item) => item.periodMonth === month && item.classId === studyClass.id && item.status !== 'resolved').length,
    }
  })

  const materialTotals = (materialType: 'hasda' | 'asad') => {
    const participants = snapshotJamaah.filter((person) =>
      person.active && person.classIds.some((id) => selectedClassIds.has(id)) && isEligibleForMaterial(materialType, person, classMap),
    )
    const unique = [...new Map(participants.map((person) => [person.id, person])).values()]
    const isCompleted = (personId: string) => materialCompletions.some(
      (item) => item.month === month && item.materialType === materialType && item.jamaahId === personId,
    )
    const done = unique.filter((person) => isCompleted(person.id)).length
    const byGender = (gender: 'Laki-laki' | 'Perempuan') => {
      const genderParticipants = unique.filter((person) => person.gender === gender)
      const genderDone = genderParticipants.filter((person) => isCompleted(person.id)).length
      return { done: genderDone, total: genderParticipants.length, percent: percentage(genderDone, genderParticipants.length) }
    }
    return { total: unique.length, done, percent: percentage(done, unique.length), male: byGender('Laki-laki'), female: byGender('Perempuan') }
  }

  const hasda = materialTotals('hasda')
  const asad = materialTotals('asad')
  const readiness = [
    { label: 'Sudah ada sesi absensi', ready: sessions.length > 0 },
    { label: 'Tidak ada tindak lanjut terbuka', ready: openFollowUps === 0 },
    { label: 'Hasda mencapai 100%', ready: hasda.total === 0 || hasda.percent === 100 },
    { label: 'ASAD mencapai 100%', ready: asad.total === 0 || asad.percent === 100 },
  ]
  const readyCount = readiness.filter((item) => item.ready).length

  const classPagination = usePagination(classReports, `${month}|${classId}`)

  const jamaahReportRows = classReports.flatMap((report) => report.members.map((person) => {
    const statuses = report.sessions.map((session) => session.statuses[person.id]).filter(Boolean) as AttendanceStatus[]
    const counts = attendanceCounts(Object.fromEntries(statuses.map((status, index) => [String(index), status])))
    const completion = (materialType: 'hasda' | 'asad') => {
      if (!isEligibleForMaterial(materialType, person, classMap)) return '-'
      return materialCompletions.some((item) => item.month === month && item.materialType === materialType && item.jamaahId === person.id) ? 'Tuntas' : 'Belum'
    }
    const followUp = followUps.find((item) => item.periodMonth === month && item.classId === report.classId && item.jamaahId === person.id)
    return {
      className: report.className,
      fullName: person.fullName,
      censusCategory: person.censusCategory,
      sessions: statuses.length,
      present: counts.present,
      excused: counts.excused,
      sick: counts.sick,
      absent: counts.absent,
      attendanceRate: percentage(counts.present, statuses.length),
      hasda: completion('hasda'),
      asad: completion('asad'),
      followUp: followUp ? FOLLOW_UP_STATUS_LABELS[followUp.status] : '-',
    }
  }))

  function exportPdf() {
    downloadMonthlyReportPdf({
      month,
      monthLabel: monthLabel(month),
      classLabel: classId === 'all' ? 'Semua kelas' : classMap.get(classId) ?? 'Kelas',
      periodStatus: closed ? 'Ditutup' : 'Terbuka',
      periodNotes: period?.notes ?? '',
      totals: { sessions: sessions.length, attendanceRate: averageAttendance, present: totalPresent, records: totalRecords, jamaah: uniqueJamaah, openFollowUps },
      readiness,
      census: censusGenderSummary,
      materials: [
        { materialName: 'Hasda', male: hasda.male, female: hasda.female, total: { done: hasda.done, total: hasda.total, percent: hasda.percent } },
        { materialName: 'ASAD', male: asad.male, female: asad.female, total: { done: asad.done, total: asad.total, percent: asad.percent } },
      ],
      classes: classReports.map((report) => ({
        className: report.className,
        sessions: report.sessions.length,
        members: report.members.length,
        present: report.totals.present,
        excused: report.totals.excused,
        sick: report.totals.sick,
        absent: report.totals.absent,
        attendanceRate: report.attendanceRate,
        hasda: report.hasda.percent === null ? '-' : `${report.hasda.percent}%`,
        asad: report.asad.percent === null ? '-' : `${report.asad.percent}%`,
        openFollowUps: report.openFollowUps,
      })),
      jamaah: jamaahReportRows,
    })
  }

  async function updatePeriod() {
    if (!periodModal) return
    setWorking(true)
    setMessage(null)
    try {
      const nextStatus = periodModal === 'close' ? 'closed' : 'open'
      await setReportingPeriodStatus(month, nextStatus, periodNote.trim())
      setMessage(nextStatus === 'closed' ? 'Periode berhasil ditutup dan data bulan ini dikunci.' : 'Periode berhasil dibuka kembali.')
      setPeriodModal(null)
      setPeriodNote('')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Gagal memperbarui status periode.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Laporan Bulanan"
        description="Ringkasan evaluasi kelas, kehadiran peserta, ketuntasan materi, dan kesiapan tutup periode."
        actions={<button className="button primary" type="button" onClick={exportPdf}><Download size={16} /> Unduh Laporan PDF</button>}
      />

      <div className="notice">Anggota kelas pada laporan dihitung berdasarkan posisi keanggotaan dan status aktif di akhir bulan yang dipilih. Kenaikan kelas atau pengarsipan setelah bulan tersebut tidak mengubah laporan historis.</div>

      <article className={`period-status-card ${closed ? 'closed' : 'open'}`}>
        <div className="period-status-main">
          <span className="period-status-icon">{closed ? <Lock size={20} /> : <LockOpen size={20} />}</span>
          <div>
            <strong>Periode {monthLabel(month)} · {closed ? 'Ditutup' : 'Terbuka'}</strong>
            <small>{closed ? 'Absensi, jadwal, ketuntasan materi, dan tindak lanjut pada bulan ini tidak dapat diubah.' : 'Data bulan ini masih dapat diperbarui oleh pengguna yang memiliki akses.'}</small>
            {period?.notes ? <small>Catatan: {period.notes}</small> : null}
          </div>
        </div>
        {user?.role === 'superadmin' ? (
          <button className={`button ${closed ? 'outline' : 'primary'}`} type="button" disabled={!closed && classId !== 'all'} title={!closed && classId !== 'all' ? 'Pilih Semua kelas terlebih dahulu karena penutupan berlaku untuk seluruh periode.' : undefined} onClick={() => setPeriodModal(closed ? 'open' : 'close')}>
            {closed ? <><LockOpen size={15} /> Buka Kembali</> : classId !== 'all' ? <><Lock size={15} /> Pilih Semua Kelas</> : <><Lock size={15} /> Tutup Periode</>}
          </button>
        ) : null}
      </article>

      <section className="stats-grid four-columns report-stats">
        <StatCard label="Total Sesi" value={sessions.length} note="Pada filter bulan dan kelas" icon={<ClipboardList size={20} />} />
        <StatCard label="Kehadiran" value={`${averageAttendance}%`} note={`${totalPresent} hadir dari ${totalRecords} catatan`} icon={<Percent size={20} />} />
        <StatCard label="Peserta Tercatat" value={uniqueJamaah} note="Unik pada seluruh sesi" icon={<UsersRound size={20} />} />
        <StatCard label="Tindak Lanjut" value={openFollowUps} note="Belum selesai" icon={<TriangleAlert size={20} />} />
      </section>

      <article className="card monthly-census-composition">
        <div className="monthly-report-filters">
          <label>Bulan<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          <label>Kelas<select value={classId} onChange={(event) => setClassId(event.target.value)}><option value="all">Semua kelas</option>{visibleClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <div className="card-heading">
          <div>
            <h2>Komposisi Sensus Per Jenis Kelamin</h2>
            <p>Posisi warga aktif pada akhir {monthLabel(month)} sesuai filter kelas. {user?.role === 'admin' ? 'Angka hanya mencakup kelas yang Anda ampu dan dapat berbeda dari laporan global Superadmin.' : 'Angka Semua kelas mencakup seluruh data warga.'}</p>
          </div>
        </div>
        <div className="census-gender-grid">
          {censusGenderSummary.map((item) => (
            <div className="census-gender-card" key={item.categoryName}>
              <strong>{item.categoryName}</strong>
              <div className="census-gender-values">
                <span><small>Laki-laki</small><b>{item.male}</b></span>
                <span><small>Perempuan</small><b>{item.female}</b></span>
                <span className="census-total"><small>Total</small><b>{item.total}</b></span>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="card monthly-material-gender-summary">
        <div className="card-heading">
          <div>
            <h2>Ketuntasan Hasda & ASAD per Jenis Kelamin</h2>
            <p>Jumlah tuntas dibanding total peserta yang wajib menerima materi pada {monthLabel(month)}.</p>
          </div>
        </div>
        <div className="monthly-material-grid">
          {[{ label: 'Hasda', data: hasda }, { label: 'ASAD', data: asad }].map((item) => (
            <section className="monthly-material-card" key={item.label}>
              <div className="monthly-material-card-heading">
                <strong>{item.label}</strong>
                <span className={`badge ${item.data.percent === 100 ? 'success' : 'warning'}`}>{item.data.percent}%</span>
              </div>
              <div className="monthly-material-gender-values">
                <span><small>Laki-laki</small><b>{item.data.male.done} dari {item.data.male.total}</b><em>{item.data.male.percent}%</em></span>
                <span><small>Perempuan</small><b>{item.data.female.done} dari {item.data.female.total}</b><em>{item.data.female.percent}%</em></span>
                <span className="material-total"><small>Total</small><b>{item.data.done} dari {item.data.total}</b><em>{item.data.percent}%</em></span>
              </div>
            </section>
          ))}
        </div>
      </article>

      <article className="card">
        <div className="report-readiness">
          <div><strong>Kesiapan Tutup Periode</strong><span>{readyCount}/{readiness.length} pemeriksaan terpenuhi</span></div>
          <div className="readiness-list">{readiness.map((item) => <span className={`badge ${item.ready ? 'success' : 'warning'}`} key={item.label}>{item.ready ? '✓' : '!'} {item.label}</span>)}</div>
        </div>

        <div className="table-wrap monthly-report-table">
          <table role="table">
            <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Kelas</th><th scope="col" role="columnheader">Sesi</th><th scope="col" role="columnheader">Anggota</th><th scope="col" role="columnheader">Hadir</th><th scope="col" role="columnheader">Izin</th><th scope="col" role="columnheader">Sakit</th><th scope="col" role="columnheader">Alpa</th><th scope="col" role="columnheader">Kehadiran</th><th scope="col" role="columnheader">Hasda</th><th scope="col" role="columnheader">ASAD</th><th scope="col" role="columnheader">Tindak Lanjut</th></tr></thead>
            <tbody role="rowgroup">
              {classPagination.pageItems.map((report) => (
                <tr role="row" key={report.classId}>
                  <td role="cell" data-cell="primary"><strong>{report.className}</strong></td>
                  <td role="cell" data-label="Sesi">{report.sessions.length}</td>
                  <td role="cell" data-label="Anggota">{report.members.length}</td>
                  <td role="cell" data-label="Hadir">{report.totals.present}</td>
                  <td role="cell" data-label="Izin">{report.totals.excused}</td>
                  <td role="cell" data-label="Sakit">{report.totals.sick}</td>
                  <td role="cell" data-label="Alpa">{report.totals.absent}</td>
                  <td role="cell" data-label="Kehadiran"><span className={`badge ${report.attendanceRate >= 70 ? 'success' : 'warning'}`}>{report.attendanceRate}%</span></td>
                  <td role="cell" data-label="Hasda">{report.hasda.percent === null ? '—' : `${report.hasda.percent}%`}</td>
                  <td role="cell" data-label="ASAD">{report.asad.percent === null ? '—' : `${report.asad.percent}%`}</td>
                  <td role="cell" data-label="Tindak lanjut">{report.openFollowUps}</td>
                </tr>
              ))}
              {!classReports.length ? <tr role="row"><td role="cell" colSpan={11}><div className="empty-state">Tidak ada kelas yang dapat ditampilkan.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
        <Pagination page={classPagination.page} pageSize={classPagination.pageSize} totalItems={classReports.length} onPageChange={classPagination.setPage} onPageSizeChange={classPagination.setPageSize} />
        {message ? <div className="inline-message">{message}</div> : null}
      </article>

      <Modal open={Boolean(periodModal)} title={periodModal === 'close' ? `Tutup Periode ${monthLabel(month)}` : `Buka Kembali ${monthLabel(month)}`} onClose={() => setPeriodModal(null)}>
        <div className="period-modal-copy">
          <FileCheck2 size={34} />
          <p>{periodModal === 'close' ? 'Setelah ditutup, perubahan operasional pada bulan ini akan ditolak oleh aplikasi dan database. Periode tetap dapat dibuka kembali oleh Superadmin.' : 'Membuka periode akan mengizinkan kembali perubahan absensi, materi, jadwal, dan tindak lanjut bulan ini.'}</p>
        </div>
        <label>Catatan periode<textarea rows={4} value={periodNote} onChange={(event) => setPeriodNote(event.target.value)} placeholder="Contoh: laporan sudah diperiksa dan diserahkan kepada pengurus." /></label>
        <div className="modal-inline-actions period-modal-actions"><span /><div><button className="button outline" type="button" onClick={() => setPeriodModal(null)}>Batal</button><button className="button primary" type="button" disabled={working} onClick={() => void updatePeriod()}>{working ? 'Memproses…' : periodModal === 'close' ? 'Tutup Periode' : 'Buka Kembali'}</button></div></div>
      </Modal>
    </>
  )
}
