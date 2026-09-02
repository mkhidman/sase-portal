import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import type { AttendanceSession, AttendanceStatus, Jamaah, MaterialCompletion, StudyClass } from '../types/domain'
import { CENSUS_CATEGORIES } from './constants'
import { attendanceCounts, isEligibleForMaterial, percentage } from './utils'

export interface AttendanceTrendPoint {
  month: string
  shortLabel: string
  fullLabel: string
  sessions: number
  participants: number
  counts: Record<AttendanceStatus, number>
  presentPercent: number
}

export interface CompositionSlice {
  key: string
  label: string
  count: number
  percent: number
}

export interface CensusComposition {
  total: number
  genders: CompositionSlice[]
  categories: CompositionSlice[]
}

export interface MaterialProgressValue {
  done: number
  total: number
  percent: number
}

export interface ClassMaterialProgress {
  classId: string
  className: string
  hasda: MaterialProgressValue
  asad: MaterialProgressValue
  lowestPercent: number
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return month
  const date = new Date(year, monthNumber - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(month: string, pattern: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return month
  return format(new Date(year, monthNumber - 1, 1), pattern, { locale: id })
}

export function buildAttendanceTrend(
  sessions: AttendanceSession[],
  classIds: Set<string>,
  endMonth: string,
  monthCount = 6,
): AttendanceTrendPoint[] {
  const months = Array.from({ length: monthCount }, (_, index) => shiftMonth(endMonth, index - (monthCount - 1)))

  return months.map((month) => {
    const monthSessions = sessions.filter(
      (session) => classIds.has(session.classId) && session.date.slice(0, 7) === month,
    )
    const counts: Record<AttendanceStatus, number> = { present: 0, excused: 0, sick: 0, absent: 0 }
    monthSessions.forEach((session) => {
      const sessionCounts = attendanceCounts(session.statuses)
      counts.present += sessionCounts.present
      counts.excused += sessionCounts.excused
      counts.sick += sessionCounts.sick
      counts.absent += sessionCounts.absent
    })
    const participants = counts.present + counts.excused + counts.sick + counts.absent

    return {
      month,
      shortLabel: monthLabel(month, 'MMM'),
      fullLabel: monthLabel(month, 'MMMM yyyy'),
      sessions: monthSessions.length,
      participants,
      counts,
      presentPercent: percentage(counts.present, participants),
    }
  })
}

export function buildCensusComposition(jamaah: Jamaah[]): CensusComposition {
  const active = jamaah.filter((person) => person.active)
  const total = active.length

  const genders: CompositionSlice[] = (['Laki-laki', 'Perempuan'] as const).map((gender) => {
    const count = active.filter((person) => person.gender === gender).length
    return { key: gender, label: gender, count, percent: percentage(count, total) }
  })

  const categories = CENSUS_CATEGORIES.map((category) => {
    const count = active.filter((person) => person.censusCategory === category).length
    return { key: category, label: category, count, percent: percentage(count, total) }
  })
    .filter((slice) => slice.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  return { total, genders, categories }
}

export function buildMaterialProgressByClass(
  snapshot: Jamaah[],
  classes: StudyClass[],
  classNamesById: Map<string, string>,
  completions: MaterialCompletion[],
  month: string,
): ClassMaterialProgress[] {
  const monthCompletions = completions.filter((completion) => completion.month === month)
  const completedBy: Record<'hasda' | 'asad', Set<string>> = {
    hasda: new Set(monthCompletions.filter((item) => item.materialType === 'hasda').map((item) => item.jamaahId)),
    asad: new Set(monthCompletions.filter((item) => item.materialType === 'asad').map((item) => item.jamaahId)),
  }

  return classes
    .map((studyClass) => {
      const members = snapshot.filter((person) => person.active && person.classIds.includes(studyClass.id))
      const progressFor = (material: 'hasda' | 'asad'): MaterialProgressValue => {
        const participants = members.filter((person) => isEligibleForMaterial(material, person, classNamesById))
        const done = participants.filter((person) => completedBy[material].has(person.id)).length
        return { done, total: participants.length, percent: percentage(done, participants.length) }
      }
      const hasda = progressFor('hasda')
      const asad = progressFor('asad')

      return {
        classId: studyClass.id,
        className: studyClass.name,
        hasda,
        asad,
        lowestPercent: Math.min(hasda.percent, asad.percent),
      }
    })
    .filter((item) => item.hasda.total + item.asad.total > 0)
    .sort((a, b) => a.lowestPercent - b.lowestPercent || a.className.localeCompare(b.className))
}
