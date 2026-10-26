import { addDays, format, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'
import { MATERIAL_LABELS } from './constants.ts'
import type { AttendanceSession, AttendanceStatus, CensusCategory, ClassMembershipHistory, Jamaah, JamaahStatusHistory, MaterialCompletion, MaterialType } from '../types/domain'

export function localIsoDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function monthValue(date = new Date()): string {
  return localIsoDate(date).slice(0, 7)
}

export function addIsoDays(days: number): string {
  return localIsoDate(addDays(new Date(), days))
}

export function formatDate(value: string): string {
  return format(parseISO(value), 'dd MMMM yyyy', { locale: id })
}

export function ageFromBirthDate(value?: string | null): number | null {
  if (!value) return null

  const birth = parseISO(value)
  if (Number.isNaN(birth.getTime())) return null

  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1
  return Math.max(age, 0)
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function isMandatoryMaterial(material: MaterialType): material is 'hasda' | 'asad' {
  return material === 'hasda' || material === 'asad'
}

export function isEligibleForMaterial(
  material: Extract<MaterialType, 'hasda' | 'asad'>,
  jamaah: Jamaah,
  classNamesById: Map<string, string>,
): boolean {
  const names = jamaah.classIds.map((id) => classNamesById.get(id)).filter(Boolean)

  if (material === 'hasda') {
    return (
      names.some((name) => ['Pra Remaja', 'Remaja', 'Pra Nikah'].includes(name ?? '')) ||
      ['Menikah', 'Duda & Janda'].includes(jamaah.censusCategory)
    )
  }

  return (
    names.some((name) =>
      [
        'Caberawit Kelas A',
        'Caberawit Kelas B',
        'Caberawit Kelas C',
        'Pra Remaja',
        'Remaja',
        'Pra Nikah',
      ].includes(name ?? ''),
    ) || ['Menikah', 'Duda & Janda'].includes(jamaah.censusCategory)
  )
}

export function attendanceCounts(statuses: Record<string, AttendanceStatus>): Record<AttendanceStatus, number> {
  const counts: Record<AttendanceStatus, number> = {
    present: 0,
    excused: 0,
    sick: 0,
    absent: 0,
  }
  Object.values(statuses).forEach((status) => {
    counts[status] += 1
  })
  return counts
}

export function percentage(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>): void {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
  const csv = `\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function censusCategoryForClassName(className: string, fallback: CensusCategory): CensusCategory {
  if (className === 'Playgroup') return 'Balita'
  if (['PAUD', 'Caberawit Kelas A', 'Caberawit Kelas B', 'Caberawit Kelas C'].includes(className)) return 'Caberawit'
  if (className === 'Pra Remaja') return 'Pra Remaja'
  if (className === 'Remaja') return 'Remaja'
  if (className === 'Pra Nikah') return 'Usia Nikah'
  return fallback
}

/**
 * Riwayat dikelompokkan per warga satu kali, lalu dipakai berulang. Tanpa ini tiap
 * pemanggilan snapshot menyapu seluruh tabel riwayat, sehingga memotret satu daftar
 * warga berbiaya jumlah warga dikali panjang riwayat.
 */
export interface JamaahHistoryIndex {
  classByJamaah: Map<string, ClassMembershipHistory[]>
  statusByJamaah: Map<string, JamaahStatusHistory[]>
}

function groupByJamaah<T extends { jamaahId: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  items.forEach((item) => {
    const bucket = grouped.get(item.jamaahId)
    if (bucket) bucket.push(item)
    else grouped.set(item.jamaahId, [item])
  })
  return grouped
}

export function buildJamaahHistoryIndex(
  classHistories: ClassMembershipHistory[],
  statusHistories: JamaahStatusHistory[],
): JamaahHistoryIndex {
  return {
    classByJamaah: groupByJamaah(classHistories),
    statusByJamaah: groupByJamaah(statusHistories),
  }
}

export function jamaahSnapshotFromIndex(
  jamaah: Jamaah,
  index: JamaahHistoryIndex,
  snapshotDate: string,
): Jamaah {
  const state = {
    active: jamaah.active,
    classIds: new Set(jamaah.classIds),
    censusCategory: jamaah.censusCategory,
  }

  const events = [
    ...(index.classByJamaah.get(jamaah.id) ?? [])
      .filter((item) => item.effectiveDate > snapshotDate)
      .map((item) => ({ kind: 'class' as const, effectiveDate: item.effectiveDate, createdAt: item.createdAt, item })),
    ...(index.statusByJamaah.get(jamaah.id) ?? [])
      .filter((item) => item.effectiveDate > snapshotDate)
      .map((item) => ({ kind: 'status' as const, effectiveDate: item.effectiveDate, createdAt: item.createdAt, item })),
  ].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt))

  events.forEach((event) => {
    if (event.kind === 'class') {
      if (event.item.toClassId) state.classIds.delete(event.item.toClassId)
      if (event.item.fromClassId) state.classIds.add(event.item.fromClassId)
      state.censusCategory = event.item.previousCensusCategory
      return
    }

    state.active = event.item.previousActive
    if (event.item.newActive) {
      event.item.classIds.forEach((classId) => state.classIds.delete(classId))
    } else {
      event.item.classIds.forEach((classId) => state.classIds.add(classId))
    }
  })

  return {
    ...jamaah,
    active: state.active,
    classIds: [...state.classIds],
    censusCategory: state.censusCategory,
  }
}

export function jamaahSnapshotsAsOfDate(
  jamaahList: Jamaah[],
  classHistories: ClassMembershipHistory[],
  statusHistories: JamaahStatusHistory[],
  snapshotDate: string,
): Jamaah[] {
  const index = buildJamaahHistoryIndex(classHistories, statusHistories)
  return jamaahList.map((person) => jamaahSnapshotFromIndex(person, index, snapshotDate))
}

/**
 * Dipakai bersama Dashboard dan Rekap. Sebelumnya kedua halaman menyalin
 * perhitungan ini baris per baris, sehingga aturannya harus diubah di dua tempat.
 */
export function averageAttendanceRate(sessions: AttendanceSession[]): number {
  if (!sessions.length) return 0
  const total = sessions.reduce((sum, session) => {
    const counts = attendanceCounts(session.statuses)
    return sum + percentage(counts.present, Object.keys(session.statuses).length)
  }, 0)
  return Math.round(total / sessions.length)
}

export interface MaterialProgress {
  done: number
  total: number
  percent: number
}

export function materialProgressFor(
  material: Extract<MaterialType, 'hasda' | 'asad'>,
  snapshot: Jamaah[],
  completions: MaterialCompletion[],
  month: string,
  allowedClassIds: Set<string>,
  classNamesById: Map<string, string>,
): MaterialProgress {
  const participants = snapshot.filter(
    (person) =>
      person.active &&
      person.classIds.some((id) => allowedClassIds.has(id)) &&
      isEligibleForMaterial(material, person, classNamesById),
  )
  // Ketuntasan bulan ini dikumpulkan sekali. Versi lama memindai seluruh daftar
  // ketuntasan untuk tiap peserta, jadi biayanya jumlah peserta dikali jumlah catatan.
  const completed = new Set(
    completions
      .filter((item) => item.month === month && item.materialType === material)
      .map((item) => item.jamaahId),
  )
  const done = participants.filter((person) => completed.has(person.id)).length
  return { done, total: participants.length, percent: percentage(done, participants.length) }
}

export function monthEndDate(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return `${month}-31`
  const day = new Date(year, monthNumber, 0).getDate()
  return `${month}-${String(day).padStart(2, '0')}`
}

export function materialDisplayName(materialType: import('../types/domain').MaterialType, materialName?: string | null): string {
  return materialName?.trim() || MATERIAL_LABELS[materialType]
}
