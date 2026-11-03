import type { Jamaah } from '../types/domain'

export interface DuplicateCandidate {
  id: string
  firstJamaahId: string
  secondJamaahId: string
  score: number
  reasons: string[]
}

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

export function findDuplicateCandidates(jamaah: Jamaah[]): DuplicateCandidate[] {
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
  return duplicates.sort((first, second) => second.score - first.score)
}
