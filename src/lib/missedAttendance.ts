import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { AttendanceSession, Schedule } from '../types/domain'
import { localIsoDate } from './utils'

export const MISSED_ATTENDANCE_MAX_AGE_DAYS = 60

export interface MissedSchedule {
  schedule: Schedule
  daysLate: number
}

function sessionKey(item: Pick<Schedule, 'classId' | 'date' | 'materialType' | 'materialName'>): string {
  return `${item.classId}|${item.date}|${item.materialType}|${item.materialName ?? ''}`
}

// Jadwal yang tanggalnya sudah lewat tetapi belum pernah tersimpan sebagai sesi absensi.
// Tanpa daftar ini, jadwal yang terlewat hilang dari Jadwal (hanya menampilkan >= hari ini)
// maupun dari Rekap (hanya menampilkan sesi yang sudah ada).
export function buildMissedAttendance({
  schedules,
  sessions,
  classIds,
  today = localIsoDate(),
  maxAgeDays = MISSED_ATTENDANCE_MAX_AGE_DAYS,
}: {
  schedules: Schedule[]
  sessions: AttendanceSession[]
  classIds: Set<string>
  today?: string
  maxAgeDays?: number
}): MissedSchedule[] {
  const recorded = new Set(sessions.map(sessionKey))
  const reference = parseISO(today)

  return schedules
    .filter((schedule) => classIds.has(schedule.classId) && schedule.date < today && !recorded.has(sessionKey(schedule)))
    .map((schedule) => ({ schedule, daysLate: differenceInCalendarDays(reference, parseISO(schedule.date)) }))
    .filter((item) => item.daysLate <= maxAgeDays)
    .sort((first, second) => second.schedule.date.localeCompare(first.schedule.date))
}

export function attendanceUrlForSchedule(schedule: Schedule): string {
  const params = new URLSearchParams({
    class: schedule.classId,
    date: schedule.date,
    material: schedule.materialType,
  })
  if (schedule.materialName) params.set('materialName', schedule.materialName)
  if (schedule.notes) params.set('notes', schedule.notes)
  return `/absensi?${params.toString()}`
}
