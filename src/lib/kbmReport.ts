import { attendanceCounts, percentage } from './utils.ts'
import type { AttendanceSession, Jamaah, StudyClass } from '../types/domain'

export interface KbmMemberRow {
  jamaahId: string
  fullName: string
  /** Sesi kelas ini pada bulan itu yang namanya benar-benar tercatat. */
  recorded: number
  present: number
  percent: number
}

export interface KbmClassReport {
  classId: string
  className: string
  /** "Jumlah pertemuan" pada laporan cetak: sesi kelas ini sepanjang bulan. */
  sessions: number
  members: KbmMemberRow[]
  averagePercent: number
}

/**
 * Tingkat kehadiran per generus untuk laporan bulanan ke orang tua.
 *
 * Penyebutnya adalah sesi yang namanya tercatat, BUKAN jumlah pertemuan kelas.
 * Generus yang baru masuk di tengah bulan tidak hadir pada sesi sebelum ia
 * terdaftar, dan menghitungnya sebagai mangkir membuat angkanya terbaca jauh
 * lebih buruk daripada kenyataan -- tanpa satu pun error, dan angka itu
 * dibacakan di depan orang tuanya.
 *
 * `members` harus berupa potret akhir bulan (jamaahSnapshotsAsOfDate), supaya
 * generus yang naik kelas sesudahnya tetap muncul di kelas lamanya.
 */
export function buildKbmReport(
  classes: StudyClass[],
  members: Jamaah[],
  sessions: AttendanceSession[],
  month: string,
): KbmClassReport[] {
  const monthSessions = sessions.filter((session) => session.date.startsWith(month))

  return classes.map((studyClass) => {
    const classSessions = monthSessions.filter((session) => session.classId === studyClass.id)
    const classMembers = members
      .filter((person) => person.active && person.classIds.includes(studyClass.id))
      .sort((left, right) => left.fullName.localeCompare(right.fullName, 'id'))

    const rows = classMembers.map((person) => {
      const statuses = classSessions
        .map((session) => session.statuses[person.id])
        .filter(Boolean)
      const counts = attendanceCounts(Object.fromEntries(statuses.map((status, index) => [String(index), status!])))
      return {
        jamaahId: person.id,
        fullName: person.fullName,
        recorded: statuses.length,
        present: counts.present,
        percent: percentage(counts.present, statuses.length),
      }
    })

    const withRecords = rows.filter((row) => row.recorded > 0)
    return {
      classId: studyClass.id,
      className: studyClass.name,
      sessions: classSessions.length,
      members: rows,
      averagePercent: withRecords.length
        ? Math.round(withRecords.reduce((sum, row) => sum + row.percent, 0) / withRecords.length)
        : 0,
    }
  })
}
