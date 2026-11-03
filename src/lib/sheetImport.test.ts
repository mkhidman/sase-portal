// Sel Excel tidak selalu teks: tanggal lahir terbaca sebagai objek Date dan nomor
// WhatsApp sebagai angka. Kalau aturan ini rusak tidak ada error apa pun — barisnya
// tetap terimpor, hanya tanggal lahirnya hilang sehingga usia dan kategori sensus
// pada laporan ikut salah tanpa ada yang menyadarinya.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildJamaahImportPreview } from './sheetImport.ts'
import { CENSUS_CATEGORIES } from './constants.ts'
import type { StudyClass } from '../types/domain.ts'

const kelas: StudyClass[] = [{ id: 'k-01', name: 'Caberawit Kelas C', active: true }]
const header = ['Nama', 'Jenis Kelamin', 'Tanggal Lahir', 'WhatsApp', 'Kategori Sensus', 'Kelas Pengajian', 'Status']

function preview(rows: unknown[][]) {
  return buildJamaahImportPreview([header, ...rows], [], kelas, CENSUS_CATEGORIES)
}

test('tanggal lahir berbentuk Date dari Excel tetap terbaca', () => {
  const [row] = preview([['Ahmad Fauzan', 'Laki-laki', new Date(Date.UTC(2014, 3, 14)), '081234567890', 'Caberawit', 'Caberawit Kelas C', 'Aktif']])
  assert.equal(row?.status, 'valid')
  assert.equal(row?.jamaah?.birthDate, '2014-04-14')
  assert.deepEqual(row?.jamaah?.classIds, ['k-01'])
})

test('sel angka dan sel kosong tidak membatalkan baris', () => {
  const [row] = preview([['Nur Aisyah', 'Perempuan', null, 81234567891, 'Remaja', '', 'Aktif']])
  assert.equal(row?.status, 'valid')
  assert.equal(row?.jamaah?.birthDate, '')
  assert.equal(row?.jamaah?.phone, '81234567891')
})

test('baris kosong di bawah data tidak dihitung sebagai baris bermasalah', () => {
  const rows = preview([['Ahmad Fauzan', 'Laki-laki', '2014-04-14', '', 'Caberawit', '', 'Aktif'], [null, null, null], ['', '', '']])
  assert.equal(rows.length, 1)
})
