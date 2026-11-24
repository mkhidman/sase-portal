// Ekstensi .ts eksplisit: berkas ini ikut dimuat penjalan tes bawaan Node, yang tidak menebak ekstensi.
import { monthEndDate, monthLabel, monthValue } from './utils.ts'
import type { AttendanceSession, GuardianContact, Jamaah, StudyClass, WaliAccess, WaliMember, WaliView } from '../types/domain'

/**
 * Tautan wali dibuka tanpa login. Penyusunan daftarnya tinggal di sini supaya
 * jalur demo dan RPC wali_attendance memakai aturan yang sama: hanya warga yang
 * benar-benar menjadi tanggungan wali ini yang boleh muncul. Kalau penyaringnya
 * longgar, halaman itu membocorkan absensi warga lain ke orang luar -- dan di
 * layar admin tidak ada satu pun yang berubah sebagai penanda.
 */

export type WaliWindow = Pick<WaliAccess, 'windowPreset' | 'fromMonth' | 'toMonth'>

export const WALI_WINDOW_DEFAULT: WaliWindow = { windowPreset: '3-bulan', fromMonth: '', toMonth: '' }

export const WALI_WINDOW_OPTIONS: { value: WaliAccess['windowPreset']; label: string }[] = [
  { value: 'bulan-ini', label: 'Bulan ini' },
  { value: 'bulan-lalu', label: 'Bulan lalu' },
  { value: '3-bulan', label: '3 bulan terakhir' },
  { value: '6-bulan', label: '6 bulan terakhir' },
  { value: 'custom', label: 'Rentang sendiri' },
]

function monthSpan(from: string, to: string): { since: string; until: string } {
  return { since: `${from}-01`, until: monthEndDate(to) }
}

/**
 * Rentang tanggal yang dilihat wali, dibatasi per bulan penuh supaya bulan tertua
 * tidak tampil separuh. Dicerminkan RPC wali_attendance: mengubah salah satunya saja
 * membuat halaman wali dan jalur demo menampilkan periode yang berbeda.
 */
export function waliWindowRange(window: WaliWindow, today = new Date()): { since: string; until: string } {
  const monthsBack = (count: number) => monthValue(new Date(today.getFullYear(), today.getMonth() - count, 1))
  const thisMonth = monthValue(today)
  switch (window.windowPreset) {
    case 'bulan-ini':
      return monthSpan(thisMonth, thisMonth)
    case 'bulan-lalu':
      return monthSpan(monthsBack(1), monthsBack(1))
    case '6-bulan':
      return monthSpan(monthsBack(5), thisMonth)
    case 'custom':
      // Rentang setengah terisi jatuh ke bawaan: lebih baik tiga bulan daripada seluruh riwayat.
      if (window.fromMonth && window.toMonth) {
        return window.fromMonth <= window.toMonth
          ? monthSpan(window.fromMonth, window.toMonth)
          : monthSpan(window.toMonth, window.fromMonth)
      }
  }
  return monthSpan(monthsBack(2), thisMonth)
}

/** Nama rentang untuk dibaca manusia, disusun dari tanggalnya supaya halaman wali tidak perlu tahu presetnya. */
export function waliRangeLabel(since: string, until: string): string {
  if (!since || !until) return ''
  const from = since.slice(0, 7)
  const to = until.slice(0, 7)
  return from === to ? monthLabel(from) : `${monthLabel(from)} - ${monthLabel(to)}`
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
  until: string
}): WaliView | null {
  const guardian = input.jamaah.find((person) => person.id === input.guardianId)
  if (!guardian) return null
  const members = dependantsOfGuardian(input.guardianId, input.jamaah, input.guardianContacts)

  const classNames = new Map(input.classes.map((item) => [item.id, item.name]))
  const relevant = input.sessions
    .filter((session) => session.date >= input.since && session.date <= input.until)
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

  return { wali: guardian.fullName, sejak: input.since, sampai: input.until, anggota }
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
