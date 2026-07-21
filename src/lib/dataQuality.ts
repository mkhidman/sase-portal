import type { GuardianContact, Jamaah, StudyClass } from '../types/domain'
import { ageFromBirthDate } from './utils'

export type DataQualitySeverity = 'critical' | 'warning' | 'info'
export type DataQualityIssueCode =
  | 'no_class'
  | 'no_contact'
  | 'child_without_guardian'
  | 'missing_birth_date'
  | 'age_55_without_special_class'
  | 'category_class_mismatch'
  | 'invalid_phone'

export interface DataQualityIssue {
  id: string
  jamaahId: string
  code: DataQualityIssueCode
  severity: DataQualitySeverity
  title: string
  description: string
}

export interface DuplicateCandidate {
  id: string
  firstJamaahId: string
  secondJamaahId: string
  score: number
  reasons: string[]
}

export interface DataQualityResult {
  issues: DataQualityIssue[]
  duplicates: DuplicateCandidate[]
  completenessPercent: number
  peopleWithIssues: number
}

const CHILD_CATEGORIES = new Set(['Balita', 'Caberawit', 'Pra Remaja'])

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(bapak|pak|ibu|bu|ustadz|ustad|ust|haji|hj)\b/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('62')) return `0${digits.slice(2)}`
  return digits
}

function hasExpectedPrimaryClass(person: Jamaah, classNameById: Map<string, string>): boolean {
  const names = person.classIds.map((id) => classNameById.get(id) ?? '')
  switch (person.censusCategory) {
    case 'Balita':
      return names.some((name) => name === 'Playgroup')
    case 'Caberawit':
      return names.some((name) => ['PAUD', 'Caberawit Kelas A', 'Caberawit Kelas B', 'Caberawit Kelas C'].includes(name))
    case 'Pra Remaja':
      return names.includes('Pra Remaja')
    case 'Remaja':
      return names.includes('Remaja')
    case 'Usia Nikah':
      return names.includes('Pra Nikah')
    default:
      return true
  }
}

function duplicateReasons(first: Jamaah, second: Jamaah): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []
  const firstName = normalizeName(first.fullName)
  const secondName = normalizeName(second.fullName)
  const firstPhone = normalizePhone(first.phone)
  const secondPhone = normalizePhone(second.phone)

  if (firstName && firstName === secondName) {
    score += 55
    reasons.push('Nama sama')
  }
  if (firstPhone && secondPhone && firstPhone === secondPhone) {
    score += 70
    reasons.push('Nomor WhatsApp sama')
  }
  if (first.birthDate && second.birthDate && first.birthDate === second.birthDate) {
    score += 35
    reasons.push('Tanggal lahir sama')
  }
  if (first.gender === second.gender) score += 5

  return { score, reasons }
}

export function analyzeDataQuality(
  jamaah: Jamaah[],
  classes: StudyClass[],
  guardianContacts: GuardianContact[],
): DataQualityResult {
  const active = jamaah.filter((person) => person.active)
  const classNameById = new Map(classes.map((studyClass) => [studyClass.id, studyClass.name]))
  const guardianByJamaah = new Map<string, GuardianContact[]>()
  guardianContacts.forEach((contact) => {
    const list = guardianByJamaah.get(contact.jamaahId) ?? []
    list.push(contact)
    guardianByJamaah.set(contact.jamaahId, list)
  })

  const issues: DataQualityIssue[] = []
  const addIssue = (person: Jamaah, code: DataQualityIssueCode, severity: DataQualitySeverity, title: string, description: string) => {
    issues.push({ id: `${person.id}:${code}`, jamaahId: person.id, code, severity, title, description })
  }

  active.forEach((person) => {
    const guardians = guardianByJamaah.get(person.id) ?? []
    const hasGuardianPhone = guardians.some((contact) => normalizePhone(contact.phone).length >= 9)
    const phone = normalizePhone(person.phone)

    if (!person.classIds.length) {
      addIssue(person, 'no_class', 'critical', 'Belum memiliki kelas', 'Jamaah aktif tidak akan muncul pada daftar absensi kelas mana pun.')
    }
    if (!phone && !hasGuardianPhone) {
      addIssue(person, 'no_contact', 'warning', 'Tidak memiliki kontak', 'Nomor pribadi dan kontak wali belum tersedia untuk kebutuhan tindak lanjut.')
    }
    if (CHILD_CATEGORIES.has(person.censusCategory) && !guardians.length) {
      addIssue(person, 'child_without_guardian', 'warning', 'Kontak wali belum diisi', `Kategori ${person.censusCategory} sebaiknya memiliki minimal satu kontak wali.`)
    }
    if (!person.birthDate) {
      addIssue(person, 'missing_birth_date', 'info', 'Tanggal lahir belum diisi', 'Usia dan rekomendasi kelas berbasis umur tidak dapat diperiksa.')
    }
    if (phone && phone.length < 9) {
      addIssue(person, 'invalid_phone', 'warning', 'Nomor WhatsApp terlalu pendek', 'Periksa kembali format nomor agar tombol WhatsApp dapat digunakan.')
    }
    if (!hasExpectedPrimaryClass(person, classNameById)) {
      addIssue(person, 'category_class_mismatch', 'warning', 'Kategori dan kelas tidak selaras', 'Jamaah belum memiliki kelas utama yang sesuai dengan kategori sensusnya.')
    }

    const age = ageFromBirthDate(person.birthDate)
    const hasSpecialClass = person.classIds.some((id) => classNameById.get(id) === 'Pengajian Usia Istimewa')
    if (age !== null && age >= 55 && !hasSpecialClass) {
      addIssue(person, 'age_55_without_special_class', 'info', 'Belum masuk Pengajian Usia Istimewa', `Usia tercatat ${age} tahun, tetapi kelas Pengajian Usia Istimewa belum dipilih.`)
    }
  })

  const duplicates: DuplicateCandidate[] = []
  for (let firstIndex = 0; firstIndex < jamaah.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < jamaah.length; secondIndex += 1) {
      const first = jamaah[firstIndex]!
      const second = jamaah[secondIndex]!
      const result = duplicateReasons(first, second)
      if (result.score < 60) continue
      duplicates.push({
        id: `${first.id}:${second.id}`,
        firstJamaahId: first.id,
        secondJamaahId: second.id,
        score: Math.min(result.score, 100),
        reasons: result.reasons,
      })
    }
  }

  const peopleWithIssues = new Set(issues.map((issue) => issue.jamaahId)).size
  const completenessPercent = active.length ? Math.max(0, Math.round(((active.length - peopleWithIssues) / active.length) * 100)) : 100

  return {
    issues: issues.sort((first, second) => {
      const weight = { critical: 0, warning: 1, info: 2 }
      return weight[first.severity] - weight[second.severity] || first.title.localeCompare(second.title)
    }),
    duplicates: duplicates.sort((first, second) => second.score - first.score),
    completenessPercent,
    peopleWithIssues,
  }
}
