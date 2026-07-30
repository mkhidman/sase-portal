import type { AttendanceSession, CensusCategory, Jamaah, StudyClass } from '../types/domain'

export const GENERAL_ATTENDANCE_CLASS_NAME = 'Pengajian Umum'
export const GENERAL_ATTENDANCE_MATERIAL_PREFIX = '[Pengajian Umum]'

const GENERATED_GROUPS: Array<{ censusCategory: CensusCategory; className: string }> = [
  { censusCategory: 'Pra Remaja', className: 'Pra Remaja' },
  { censusCategory: 'Remaja', className: 'Remaja' },
  { censusCategory: 'Usia Nikah', className: 'Pra Nikah' },
]

export function generatedGeneralMaterialName(materialName: string): string {
  const normalized = materialName.trim()
  return normalized ? `${GENERAL_ATTENDANCE_MATERIAL_PREFIX} ${normalized}` : GENERAL_ATTENDANCE_MATERIAL_PREFIX
}

export function isGeneralAttendanceBreakdownDay(date: string): boolean {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return false
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 1 || weekday === 3
}

export function buildGeneralAttendanceBreakdown(
  parent: AttendanceSession,
  classes: StudyClass[],
  jamaah: Jamaah[],
  existingSessions: AttendanceSession[],
): AttendanceSession[] {
  const sourceClass = classes.find((item) => item.id === parent.classId)
  if (sourceClass?.name !== GENERAL_ATTENDANCE_CLASS_NAME || !isGeneralAttendanceBreakdownDay(parent.date)) return []

  const jamaahMap = new Map(jamaah.map((person) => [person.id, person]))
  const generatedMaterialName = generatedGeneralMaterialName(parent.materialName)

  return GENERATED_GROUPS.flatMap(({ censusCategory, className }) => {
    const targetClass = classes.find((item) => item.active && item.name === className)
    if (!targetClass) return []

    const statuses = Object.fromEntries(
      Object.entries(parent.statuses)
        .filter(([jamaahId]) => jamaahMap.get(jamaahId)?.censusCategory === censusCategory),
    )
    if (!Object.keys(statuses).length) return []

    const existing = existingSessions.find(
      (item) => item.generatedFromSessionId === parent.id && item.classId === targetClass.id,
    )
    return [{
      id: existing?.id ?? crypto.randomUUID(),
      date: parent.date,
      classId: targetClass.id,
      materialType: parent.materialType,
      materialName: generatedMaterialName,
      notes: parent.notes,
      statuses,
      savedAt: parent.savedAt,
      revision: (existing?.revision ?? 0) + 1,
      generatedFromSessionId: parent.id,
    }]
  })
}
