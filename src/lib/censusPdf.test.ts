import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCensusPdfGroups } from './censusPdf.ts'
import type { Jamaah } from '../types/domain.ts'

function warga(over: Partial<Jamaah>): Jamaah {
  return {
    id: crypto.randomUUID(),
    fullName: 'Tanpa Nama',
    gender: 'Laki-laki',
    birthDate: '',
    phone: '',
    censusCategory: 'Remaja',
    active: true,
    classIds: [],
    ...over,
  } as Jamaah
}

// Daftar ini dicetak sebagai daftar anggota. Warga yang sudah diarsipkan tidak
// memunculkan error kalau ikut tercetak -- hanya daftar yang lebih panjang dari
// kenyataan, dan tidak ada yang memeriksanya sampai laporannya sudah dibagikan.
test('buildCensusPdfGroups hanya memuat warga aktif', () => {
  const groups = buildCensusPdfGroups([
    warga({ fullName: 'Aktif', active: true }),
    warga({ fullName: 'Diarsipkan', active: false }),
  ], ['Remaja'])
  assert.deepEqual(groups[0]?.male.map((item) => item.fullName), ['Aktif'])
})

test('buildCensusPdfGroups memisah jenis kelamin, mengurutkan nama, dan mengambil tahun lahir', () => {
  const groups = buildCensusPdfGroups([
    warga({ fullName: 'Zainal', gender: 'Laki-laki', birthDate: '1990-04-12' }),
    warga({ fullName: 'Ahmad', gender: 'Laki-laki', birthDate: '' }),
    warga({ fullName: 'Siti', gender: 'Perempuan', birthDate: '2004-12-01' }),
  ], ['Remaja'])
  assert.deepEqual(groups[0]?.male, [
    { fullName: 'Ahmad', birthYear: '' },
    { fullName: 'Zainal', birthYear: '1990' },
  ])
  assert.deepEqual(groups[0]?.female, [{ fullName: 'Siti', birthYear: '2004' }])
})

test('buildCensusPdfGroups membuang kategori kosong dan menjaga urutan kategori', () => {
  const groups = buildCensusPdfGroups(
    [warga({ censusCategory: 'Menikah' }), warga({ censusCategory: 'Balita' })],
    ['Balita', 'Remaja', 'Menikah'],
  )
  assert.deepEqual(groups.map((group) => group.categoryName), ['Balita', 'Menikah'])
})
