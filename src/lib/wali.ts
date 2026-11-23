import type { AttendanceSession, GuardianContact, Jamaah, StudyClass, WaliMember, WaliView } from '../types/domain'

/**
 * Tautan wali dibuka tanpa login. Penyusunan daftarnya tinggal di sini supaya
 * jalur demo dan RPC wali_attendance memakai aturan yang sama: hanya warga yang
 * benar-benar menjadi tanggungan wali ini yang boleh muncul. Kalau penyaringnya
 * longgar, halaman itu membocorkan absensi warga lain ke orang luar -- dan di
 * layar admin tidak ada satu pun yang berubah sebagai penanda.
 */

export const WALI_WINDOW_MONTHS = 3

/** Awal jendela tampilan, mengikuti batas 3 bulan di RPC. */
export function waliWindowStart(today: Date): string {
  const start = new Date(today.getFullYear(), today.getMonth() - WALI_WINDOW_MONTHS, today.getDate())
  const month = String(start.getMonth() + 1).padStart(2, '0')
  const day = String(start.getDate()).padStart(2, '0')
  return `${start.getFullYear()}-${month}-${day}`
}

/** Warga yang menjadi tanggungan wali ini: dirinya sendiri lebih dulu, lalu warga aktif yang walinya dia. */
export function dependantsOfGuardian(
  guardianId: string,
  jamaah: Jamaah[],
  guardianContacts: GuardianContact[],
): Jamaah[] {
  const guardian = jamaah.find((person) => person.id === guardianId)
  if (!guardian) return []
  const dependantIds = new Set(
    guardianContacts
      .filter((contact) => contact.guardianJamaahId === guardianId && contact.jamaahId !== guardianId)
      .map((contact) => contact.jamaahId),
  )
  const dependants = jamaah
    .filter((person) => person.active && dependantIds.has(person.id))
    .sort((left, right) => left.fullName.localeCompare(right.fullName, 'id'))
  return [guardian, ...dependants]
}

export function buildWaliView(input: {
  guardianId: string
  jamaah: Jamaah[]
  guardianContacts: GuardianContact[]
  classes: StudyClass[]
  sessions: AttendanceSession[]
  since: string
}): WaliView | null {
  const guardian = input.jamaah.find((person) => person.id === input.guardianId)
  if (!guardian) return null
  const members = dependantsOfGuardian(input.guardianId, input.jamaah, input.guardianContacts)

  const classNames = new Map(input.classes.map((item) => [item.id, item.name]))
  const relevant = input.sessions
    .filter((session) => session.date >= input.since)
    .sort((left, right) => right.date.localeCompare(left.date))

  const anggota: WaliMember[] = members.map((person) => ({
    nama: person.fullName,
    kelas: person.classIds.flatMap((id) => classNames.get(id) ?? []).join(', '),
    absensi: relevant.flatMap((session) => {
      const status = session.statuses[person.id]
      return status
        ? [{ tanggal: session.date, materiTipe: session.materialType, materiNama: session.materialName, status }]
        : []
    }),
  }))

  return { wali: guardian.fullName, sejak: input.since, anggota }
}

export function buildWaliLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/wali/${token}`
}

export function buildWaliInviteMessage(input: { waliName: string; link: string }): string {
  // Format WhatsApp: *tebal* dan _miring_.
  return [
    `*Akses Absensi Keluarga - SASE Portal*`,
    '',
    `Assalamu'alaikum ${input.waliName},`,
    '',
    'Berikut tautan untuk melihat absensi pengajian anggota keluarga Anda:',
    input.link,
    '',
    'Tautan ini bersifat pribadi. Mohon tidak diteruskan ke orang lain, karena siapa pun yang membukanya dapat melihat data keluarga Anda.',
    '',
    '_Jika tautan tidak lagi berfungsi, silakan hubungi pengurus._',
  ].join('\n')
}
