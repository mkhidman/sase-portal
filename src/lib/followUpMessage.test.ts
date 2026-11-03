// Daftar ini keluar dari aplikasi menuju grup WhatsApp. Kalau penyaringnya rusak,
// tidak ada error dan tidak ada angka yang berubah di layar -- yang terjadi hanya
// warga yang sudah tuntas ikut ditagih di depan orang banyak.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildFollowUpMessage, pendingNames } from './followUpMessage.ts'

const participants = [
  { id: 'c', fullName: 'Citra' },
  { id: 'a', fullName: 'Andi' },
  { id: 'b', fullName: 'Budi' },
  { id: 'd', fullName: 'Dewi' },
]

test('hanya warga yang belum tuntas yang masuk daftar, urut A-Z', () => {
  assert.deepEqual(pendingNames(participants, new Set(['a', 'd'])), ['Budi', 'Citra'])
  // Semua tuntas: daftarnya kosong, bukan berisi semua orang.
  assert.deepEqual(pendingNames(participants, new Set(['a', 'b', 'c', 'd'])), [])
  // Tidak ada yang tuntas: semuanya masuk.
  assert.deepEqual(pendingNames(participants, new Set()), ['Andi', 'Budi', 'Citra', 'Dewi'])
})

test('buildFollowUpMessage menomori daftar dan menyebut jumlahnya', () => {
  const message = buildFollowUpMessage({
    material: 'Hasda',
    monthLabel: 'November 2026',
    groupLabel: 'Remaja',
    names: ['Budi', 'Citra'],
    generatedOn: '03 November 2026',
  })
  assert.match(message, /\*Follow Up Ketuntasan Hasda - November 2026\*/)
  assert.match(message, /Kelompok: Remaja/)
  assert.match(message, /berikut 2 warga yang tercatat \*belum Hasda\*/)
  assert.match(message, /^1\. Budi$/m)
  assert.match(message, /^2\. Citra$/m)
  assert.match(message, /segera minta disusulkan/)
  assert.match(message, /_Data per 03 November 2026 - SASE Portal_/)
})
