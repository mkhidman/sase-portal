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

export interface AbsenceInquiryInput {
  jamaahName: string
  className: string
  monthLabel: string
  absentCount: number
  consecutiveAbsence: number
  toGuardian: boolean
}

/**
 * Pesan tanya kabar untuk warga yang absensinya bermasalah.
 *
 * Angkanya ikut terkirim ke orang tua, jadi penyusunannya tinggal di sini,
 * bukan di halaman: kalau hitungannya keliru, yang menerima koreksi adalah
 * wali, bukan pengurus -- dan di layar tidak ada yang berubah sebagai penanda.
 * Baris yang dikirim pun tidak boleh berbunyi "Alpa 0 kali": baris Warga Perlu
 * Perhatian bisa muncul hanya karena ada catatan tindak lanjut, tanpa satu pun
 * alpa pada bulan itu.
 */
export function buildAbsenceInquiryMessage({
  jamaahName, className, monthLabel, absentCount, consecutiveAbsence, toGuardian,
}: AbsenceInquiryInput): string {
  const sapaan = toGuardian ? `Bapak/Ibu wali dari *${jamaahName}*` : `*${jamaahName}*`
  const catatan = absentCount > 0
    ? `tercatat *Alpa ${absentCount} kali*${consecutiveAbsence >= 2 ? `, ${consecutiveAbsence} di antaranya berturut-turut` : ''}`
    : 'tercatat perlu ditindaklanjuti'
  return [
    `Assalamu'alaikum ${sapaan},`,
    '',
    `Dari catatan absensi kelas *${className}* bulan ${monthLabel}, yang bersangkutan ${catatan}.`,
    '',
    'Mohon informasinya apakah ada kendala, supaya kami bisa bantu.',
    '',
    '_SASE Portal_',
  ].join('\n')
}
