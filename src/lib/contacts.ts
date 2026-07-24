import type { GuardianContact, Jamaah } from '../types/domain'

export interface PreferredContact {
  name: string
  phone: string
  relationship: string
  source: 'jamaah' | 'guardian'
}

export function preferredContactForJamaah(
  jamaah: Jamaah,
  guardianContacts: GuardianContact[],
  allJamaah: Jamaah[] = [],
): PreferredContact | null {
  if (jamaah.phone.trim()) {
    return {
      name: jamaah.fullName,
      phone: jamaah.phone.trim(),
      relationship: 'Warga',
      source: 'jamaah',
    }
  }

  const peopleById = new Map(allJamaah.map((person) => [person.id, person]))
  const contacts = guardianContacts
    .filter((item) => item.jamaahId === jamaah.id)
    .map((item) => {
      const linked = item.guardianJamaahId ? peopleById.get(item.guardianJamaahId) : null
      return {
        ...item,
        fullName: linked?.fullName ?? item.fullName,
        phone: linked?.phone ?? item.phone,
      }
    })
    .filter((item) => item.phone.trim())
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.fullName.localeCompare(b.fullName, 'id'))
  const selected = contacts[0]
  if (!selected) return null

  return {
    name: selected.fullName,
    phone: selected.phone.trim(),
    relationship: selected.relationship,
    source: 'guardian',
  }
}
