import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildKbmReport } from './kbmReport.ts'
import type { AttendanceSession, Jamaah, StudyClass } from '../types/domain.ts'

const kelas: StudyClass[] = [{ id: 'k1', name: 'Pra Remaja', active: true } as StudyClass]

function warga(id: string, nama: string): Jamaah {
  return { id, fullName: nama, gender: 'Laki-laki', birthDate: '', phone: '', censusCategory: 'Pra Remaja', active: true, classIds: ['k1'] } as Jamaah
}

function sesi(id: string, date: string, statuses: Record<string, string>): AttendanceSession {
  return { id, date, classId: 'k1', materialType: 'general', materialName: '', notes: '', savedAt: '', revision: 1, generatedFromSessionId: null, statuses } as AttendanceSession
}

// Penyebutnya sesi yang namanya tercatat, bukan jumlah pertemuan kelas. Generus
// yang baru masuk pertengahan bulan tidak hadir pada sesi sebelum ia terdaftar;
// menghitungnya sebagai mangkir tidak memunculkan error apa pun, hanya angka
// yang jauh lebih buruk dari kenyataan -- dan angka itu dibacakan ke orang tua.
test('persentase memakai sesi yang namanya tercatat, bukan jumlah pertemuan', () => {
  const sessions = [
    sesi('s1', '2026-11-03', { lama: 'present' }),
    sesi('s2', '2026-11-10', { lama: 'present', baru: 'present' }),
    sesi('s3', '2026-11-17', { lama: 'absent', baru: 'present' }),
  ]
  const [laporan] = buildKbmReport(kelas, [warga('lama', 'Lama'), warga('baru', 'Baru')], sessions, '2026-11')

  assert.equal(laporan?.sessions, 3)
  const baru = laporan?.members.find((row) => row.jamaahId === 'baru')
  assert.equal(baru?.recorded, 2)
  assert.equal(baru?.percent, 100)

  const lama = laporan?.members.find((row) => row.jamaahId === 'lama')
  assert.equal(lama?.recorded, 3)
  assert.equal(lama?.percent, 67)
})

test('sesi bulan lain tidak ikut terhitung', () => {
  const sessions = [
    sesi('s1', '2026-10-27', { a: 'absent' }),
    sesi('s2', '2026-11-03', { a: 'present' }),
  ]
  const [laporan] = buildKbmReport(kelas, [warga('a', 'Aisyah')], sessions, '2026-11')
  assert.equal(laporan?.sessions, 1)
  assert.equal(laporan?.members[0]?.percent, 100)
})

test('generus tanpa satu pun catatan tidak menyeret rata-rata kelas', () => {
  const sessions = [sesi('s1', '2026-11-03', { a: 'present' })]
  const [laporan] = buildKbmReport(kelas, [warga('a', 'Aisyah'), warga('b', 'Budi')], sessions, '2026-11')
  assert.equal(laporan?.members.length, 2)
  assert.equal(laporan?.members.find((row) => row.jamaahId === 'b')?.recorded, 0)
  assert.equal(laporan?.averagePercent, 100)
})
