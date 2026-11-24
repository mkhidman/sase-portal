// Halaman wali dibuka tanpa login. Kalau penyaring tanggungan rusak, orang luar
// melihat absensi warga yang bukan keluarganya -- tanpa error, tanpa ada satu pun
// angka yang berubah di layar admin.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWaliInviteMessage, buildWaliLink, buildWaliView, dependantsOfGuardian, waliRangeLabel, waliWindowRange } from './wali.ts'
import type { AttendanceSession, GuardianContact, Jamaah, StudyClass } from '../types/domain.ts'

const person = (id: string, fullName: string, active = true, classIds: string[] = ['k1']): Jamaah => ({
  id, fullName, gender: 'Laki-laki', birthDate: '', phone: '', censusCategory: 'Caberawit', active, classIds,
})

const jamaah = [
  person('wali', 'Bapak Hendra', true, ['k2']),
  person('anak-1', 'Budi'),
  person('anak-2', 'Ani'),
  person('anak-pindah', 'Candra', false),
  person('orang-lain', 'Dewi'),
]

const contact = (jamaahId: string, guardianJamaahId: string | null): GuardianContact => ({
  id: `g-${jamaahId}`, jamaahId, guardianJamaahId, fullName: '', relationship: 'Ayah',
  phone: '', isPrimary: true, notes: '', createdAt: '', updatedAt: '',
})

const guardianContacts = [
  contact('anak-1', 'wali'),
  contact('anak-2', 'wali'),
  contact('anak-pindah', 'wali'),
  contact('orang-lain', 'wali-lain'),
]

const classes: StudyClass[] = [
  { id: 'k1', name: 'Caberawit Kelas A', active: true },
  { id: 'k2', name: 'Pengajian Umum', active: true },
]

const session = (id: string, date: string, statuses: AttendanceSession['statuses']): AttendanceSession => ({
  id, date, classId: 'k1', materialType: 'hasda', materialName: 'Bab Iman', notes: '',
  statuses, savedAt: '', revision: 1, generatedFromSessionId: null,
})

test('hanya wali dan tanggungan aktifnya yang muncul', () => {
  const names = dependantsOfGuardian('wali', jamaah, guardianContacts).map((item) => item.fullName)
  // Wali selalu lebih dulu, tanggungan urut A-Z, warga nonaktif dan anak wali lain tidak ikut.
  assert.deepEqual(names, ['Bapak Hendra', 'Ani', 'Budi'])
})

test('wali yang tidak dikenal tidak mendapat daftar apa pun', () => {
  assert.deepEqual(dependantsOfGuardian('entah-siapa', jamaah, guardianContacts), [])
  assert.equal(buildWaliView({ guardianId: 'entah-siapa', jamaah, guardianContacts, classes, sessions: [], since: '2026-01-01', until: '2026-03-31' }), null)
})

test('absensi dibatasi jendela tanggal dan hanya memuat orang yang tercatat di sesi itu', () => {
  const sessions = [
    session('s-lama', '2025-12-01', { 'anak-1': 'present', 'orang-lain': 'present' }),
    session('s-baru', '2026-02-10', { 'anak-1': 'absent', 'orang-lain': 'present' }),
    session('s-terbaru', '2026-03-05', { 'anak-1': 'present', 'anak-2': 'sick' }),
  ]
  const view = buildWaliView({ guardianId: 'wali', jamaah, guardianContacts, classes, sessions, since: '2026-01-01', until: '2026-03-31' })
  assert.ok(view)
  assert.equal(view.wali, 'Bapak Hendra')

  const budi = view.anggota.find((item) => item.nama === 'Budi')
  assert.ok(budi)
  assert.equal(budi.kelas, 'Caberawit Kelas A')
  // Sesi Desember di luar jendela, jadi tersisa dua dan yang terbaru di atas.
  assert.deepEqual(budi.absensi.map((item) => [item.tanggal, item.status]), [['2026-03-05', 'present'], ['2026-02-10', 'absent']])

  const ani = view.anggota.find((item) => item.nama === 'Ani')
  assert.ok(ani)
  // Ani tidak tercatat di sesi 10 Februari, jadi barisnya tidak dikarang.
  assert.deepEqual(ani.absensi.map((item) => item.tanggal), ['2026-03-05'])

  // Dewi warga wali lain -- namanya tidak boleh bocor walau ikut sesi yang sama.
  assert.equal(JSON.stringify(view).includes('Dewi'), false)
})

test('sesi sesudah batas akhir tidak ikut tampil', () => {
  const sessions = [
    session('s-dalam', '2026-02-10', { 'anak-1': 'present' }),
    session('s-sesudah', '2026-04-02', { 'anak-1': 'absent' }),
  ]
  const view = buildWaliView({ guardianId: 'wali', jamaah, guardianContacts, classes, sessions, since: '2026-01-01', until: '2026-03-31' })
  assert.ok(view)
  assert.deepEqual(view.anggota.find((item) => item.nama === 'Budi')?.absensi.map((item) => item.tanggal), ['2026-02-10'])
})

test('tiap pilihan rentang memberi batas bulan penuh', () => {
  // 23 November 2026. Bulan di JS 0-based: 10 = November.
  const today = new Date(2026, 10, 23)
  assert.deepEqual(waliWindowRange({ windowPreset: 'bulan-ini', fromMonth: '', toMonth: '' }, today), { since: '2026-11-01', until: '2026-11-30' })
  assert.deepEqual(waliWindowRange({ windowPreset: 'bulan-lalu', fromMonth: '', toMonth: '' }, today), { since: '2026-10-01', until: '2026-10-31' })
  assert.deepEqual(waliWindowRange({ windowPreset: '3-bulan', fromMonth: '', toMonth: '' }, today), { since: '2026-09-01', until: '2026-11-30' })
  assert.deepEqual(waliWindowRange({ windowPreset: '6-bulan', fromMonth: '', toMonth: '' }, today), { since: '2026-06-01', until: '2026-11-30' })
})

test('bulan lalu menyeberang tahun dan bulan pendek', () => {
  assert.deepEqual(waliWindowRange({ windowPreset: 'bulan-lalu', fromMonth: '', toMonth: '' }, new Date(2026, 0, 5)), { since: '2025-12-01', until: '2025-12-31' })
  // Februari 2028 kabisat: batas akhirnya 29, bukan 28 atau 31.
  assert.deepEqual(waliWindowRange({ windowPreset: 'bulan-ini', fromMonth: '', toMonth: '' }, new Date(2028, 1, 10)), { since: '2028-02-01', until: '2028-02-29' })
})

test('rentang sendiri dipakai apa adanya, yang terbalik dibetulkan, yang separuh jatuh ke bawaan', () => {
  const today = new Date(2026, 10, 23)
  assert.deepEqual(waliWindowRange({ windowPreset: 'custom', fromMonth: '2026-02', toMonth: '2026-04' }, today), { since: '2026-02-01', until: '2026-04-30' })
  assert.deepEqual(waliWindowRange({ windowPreset: 'custom', fromMonth: '2026-04', toMonth: '2026-02' }, today), { since: '2026-02-01', until: '2026-04-30' })
  // Tanpa jatuh ke bawaan, rentang separuh terisi membuka seluruh riwayat absensi ke orang luar.
  assert.deepEqual(waliWindowRange({ windowPreset: 'custom', fromMonth: '2026-04', toMonth: '' }, today), { since: '2026-09-01', until: '2026-11-30' })
})

test('nama rentang menyebut satu bulan atau dua ujungnya', () => {
  assert.equal(waliRangeLabel('2026-10-01', '2026-10-31'), 'Oktober 2026')
  assert.equal(waliRangeLabel('2026-09-01', '2026-11-30'), 'September 2026 - November 2026')
  assert.equal(waliRangeLabel('', ''), '')
})

test('pesan undangan memuat tautan dan nama wali', () => {
  const link = buildWaliLink('https://sase.example/', 'token-rahasia')
  assert.equal(link, 'https://sase.example/wali/token-rahasia')
  const message = buildWaliInviteMessage({ waliName: 'Bapak Hendra', link })
  assert.ok(message.includes(link))
  assert.ok(message.includes('Bapak Hendra'))
})
