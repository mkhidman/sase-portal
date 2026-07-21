import type { AttendanceSession, AttendanceStatus, Jamaah, JamaahFollowUp } from '../types/domain'
import { percentage } from './utils'

export type AttendanceRiskLevel = 'attention' | 'priority'

export interface AttendanceRisk {
  jamaah: Jamaah
  classId: string
  month: string
  totalSessions: number
  presentCount: number
  absentCount: number
  attendanceRate: number
  consecutiveAbsence: number
  level: AttendanceRiskLevel
  reasons: string[]
  followUp: JamaahFollowUp | null
}

function latestAbsenceStreak(statuses: AttendanceStatus[]): number {
  let streak = 0
  for (let index = statuses.length - 1; index >= 0; index -= 1) {
    if (statuses[index] !== 'absent') break
    streak += 1
  }
  return streak
}

export function buildAttendanceRisks(input: {
  jamaah: Jamaah[]
  sessions: AttendanceSession[]
  followUps: JamaahFollowUp[]
  classId: string
  month: string
}): AttendanceRisk[] {
  const sessions = input.sessions
    .filter((session) => session.classId === input.classId && session.date.startsWith(input.month))
    .sort((a, b) => a.date.localeCompare(b.date) || a.savedAt.localeCompare(b.savedAt))

  const members = input.jamaah.filter((person) => person.active && person.classIds.includes(input.classId))

  return members.flatMap((person) => {
    const statuses = sessions
      .map((session) => session.statuses[person.id])
      .filter((status): status is AttendanceStatus => Boolean(status))
    const followUp = input.followUps.find(
      (item) => item.jamaahId === person.id && item.classId === input.classId && item.periodMonth === input.month,
    ) ?? null

    if (!statuses.length && !followUp) return []

    const presentCount = statuses.filter((status) => status === 'present').length
    const absentCount = statuses.filter((status) => status === 'absent').length
    const attendanceRate = percentage(presentCount, statuses.length)
    const consecutiveAbsence = latestAbsenceStreak(statuses)
    const reasons: string[] = []

    if (absentCount >= 4) reasons.push(`Alpa ${absentCount} kali`)
    if (consecutiveAbsence >= 4) reasons.push(`Alpa ${consecutiveAbsence} sesi berturut-turut`)

    const needsAttention = reasons.length > 0 || Boolean(followUp && followUp.status !== 'resolved')
    if (!needsAttention && !followUp) return []

    const level: AttendanceRiskLevel = absentCount >= 6 || consecutiveAbsence >= 4 ? 'priority' : 'attention'
    return [{
      jamaah: person,
      classId: input.classId,
      month: input.month,
      totalSessions: statuses.length,
      presentCount,
      absentCount,
      attendanceRate,
      consecutiveAbsence,
      level,
      reasons: reasons.length ? reasons : ['Tindak lanjut tercatat'],
      followUp,
    }]
  }).sort((a, b) => {
    if (a.followUp?.status === 'resolved' && b.followUp?.status !== 'resolved') return 1
    if (b.followUp?.status === 'resolved' && a.followUp?.status !== 'resolved') return -1
    if (a.level !== b.level) return a.level === 'priority' ? -1 : 1
    return a.attendanceRate - b.attendanceRate || a.jamaah.fullName.localeCompare(b.jamaah.fullName)
  })
}

export function normalizeWhatsappNumber(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits
}
