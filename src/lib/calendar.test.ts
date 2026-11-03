import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildMonthGrid, formatTimeRange, shiftMonth } from './calendar.ts'

// Kalender ini Senin-pertama, sementara Date.getDay() Minggu-pertama. Kalau
// pergeserannya salah, tanggalnya tetap lengkap dan tidak ada error -- hanya
// meleset satu kolom, dan jadwal terbaca di hari yang keliru.
test('buildMonthGrid menempatkan tanggal 1 pada kolom hari yang benar', () => {
  // 1 November 2026 jatuh pada hari Minggu: kolom terakhir, enam sel kosong di depan.
  const november = buildMonthGrid('2026-11')
  assert.equal(november.length, 36)
  assert.deepEqual(november.slice(0, 6), [null, null, null, null, null, null])
  assert.equal(november[6], '2026-11-01')
  assert.equal(november.at(-1), '2026-11-30')

  // 1 Juni 2026 jatuh pada hari Senin: tidak ada sel kosong sama sekali.
  const juni = buildMonthGrid('2026-06')
  assert.equal(juni[0], '2026-06-01')
  assert.equal(juni.length, 30)

  // Februari kabisat: 29 hari, dan 1 Februari 2024 adalah Kamis (tiga sel kosong).
  const februari = buildMonthGrid('2024-02')
  assert.equal(februari.length, 3 + 29)
  assert.equal(februari[3], '2024-02-01')
  assert.equal(februari.at(-1), '2024-02-29')
})

test('shiftMonth menyeberangi pergantian tahun', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2026-03', 0), '2026-03')
})

test('formatTimeRange menyembunyikan jam pada jadwal yang tidak punya jam', () => {
  assert.equal(formatTimeRange('', ''), '')
  assert.equal(formatTimeRange('19:30', '21:00'), '19.30 - 21.00 WIB')
  assert.equal(formatTimeRange('19:30', ''), '19.30 WIB')
})
