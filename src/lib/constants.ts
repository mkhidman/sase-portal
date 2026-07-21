import type { AttendanceStatus, CensusCategory, FollowUpStatus, JamaahStatusReason, MaterialType } from '../types/domain'

export const CENSUS_CATEGORIES: CensusCategory[] = [
  'Balita',
  'Caberawit',
  'Pra Remaja',
  'Remaja',
  'Usia Nikah',
  'Menikah',
  'Duda & Janda',
]

export const CLASS_NAMES = [
  'Playgroup',
  'PAUD',
  'Caberawit Kelas A',
  'Caberawit Kelas B',
  'Caberawit Kelas C',
  'Pra Remaja',
  'Remaja',
  'Pra Nikah',
  'Pengajian Umum',
  'Pengajian Ibu-Ibu',
  'Pengajian Usia Istimewa',
  '5 Unsur',
] as const

export const MATERIAL_LABELS: Record<MaterialType, string> = {
  hasda: 'Penyampaian Hasda',
  asad: 'Penyampaian ASAD',
  general: 'Materi Umum',
  evaluation: 'Evaluasi',
}

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'Hadir',
  excused: 'Izin',
  sick: 'Sakit',
  absent: 'Alpa',
}

export const ATTENDANCE_OPTIONS: AttendanceStatus[] = [
  'present',
  'excused',
  'sick',
  'absent',
]


export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  pending: 'Belum ditindaklanjuti',
  contacted: 'Sudah dihubungi',
  visit_needed: 'Perlu kunjungan',
  resolved: 'Selesai',
}


export const CLASS_PROGRESSION: Record<string, string> = {
  Playgroup: 'PAUD',
  PAUD: 'Caberawit Kelas A',
  'Caberawit Kelas A': 'Caberawit Kelas B',
  'Caberawit Kelas B': 'Caberawit Kelas C',
  'Caberawit Kelas C': 'Pra Remaja',
  'Pra Remaja': 'Remaja',
  Remaja: 'Pra Nikah',
}

export const JAMAAH_STATUS_REASON_LABELS: Record<JamaahStatusReason, string> = {
  moved: 'Pindah domisili',
  stopped: 'Berhenti mengikuti pengajian',
  graduated: 'Selesai pembinaan / alumni',
  deceased: 'Meninggal dunia',
  duplicate: 'Data ganda',
  other: 'Lainnya',
  reactivated: 'Diaktifkan kembali',
}

export const JAMAAH_DEACTIVATION_REASONS: JamaahStatusReason[] = [
  'moved',
  'stopped',
  'graduated',
  'deceased',
  'duplicate',
  'other',
]

