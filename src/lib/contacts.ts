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
): PreferredContact | null {
  if (jamaah.phone.trim()) {
    return {
      name: jamaah.fullName,
      phone: jamaah.phone.trim(),
      relationship: 'Warga',
      source: 'jamaah',
    }
  }

  const contacts = guardianContacts
    .filter((item) => item.jamaahId === jamaah.id && item.phone.trim())
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
