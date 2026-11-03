/**
 * Pesan follow-up ketuntasan untuk dikirim ke grup WhatsApp.
 *
 * Penyaringan nama sengaja tinggal di sini, bukan di halaman: daftar ini keluar
 * dari aplikasi dan dibaca orang banyak. Kalau penyaringnya terbalik, warga yang
 * sudah tuntas ikut disebut "belum" di grup -- dan di layar tidak ada yang
 * berubah sedikit pun sebagai penanda.
 */

export interface FollowUpMessageInput {
  material: 'Hasda' | 'ASAD'
  monthLabel: string
  groupLabel: string
  names: string[]
  generatedOn: string
}

/** Nama warga yang belum tuntas, urut A-Z. */
export function pendingNames(
  participants: { id: string; fullName: string }[],
  completedIds: Set<string>,
): string[] {
  return participants
    .filter((person) => !completedIds.has(person.id))
    .map((person) => person.fullName)
    .sort((left, right) => left.localeCompare(right, 'id'))
}

export function buildFollowUpMessage({ material, monthLabel, groupLabel, names, generatedOn }: FollowUpMessageInput): string {
  // Format WhatsApp: *tebal* dan _miring_.
  return [
    `*Follow Up Ketuntasan ${material} - ${monthLabel}*`,
    `Kelompok: ${groupLabel}`,
    '',
    `Berdasarkan data absensi, berikut ${names.length} warga yang tercatat *belum ${material}* pada bulan ini:`,
    '',
    ...names.map((name, index) => `${index + 1}. ${name}`),
    '',
    'Mohon konfirmasinya jika memang sudah. Bila belum, mohon untuk segera minta disusulkan.',
    '',
    `_Data per ${generatedOn} - SASE Portal_`,
  ].join('\n')
}
