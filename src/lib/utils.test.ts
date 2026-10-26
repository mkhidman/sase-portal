// Dijalankan dengan `npm test` (penjalan tes bawaan Node, tanpa dependency tambahan).
// Yang diuji di sini adalah aturan yang kalau rusak tidak menimbulkan error apa pun,
// hanya angka laporan yang diam-diam berubah.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  averageAttendanceRate,
  jamaahSnapshotsAsOfDate,
  materialProgressFor,
  monthEndDate,
  percentage,
} from './utils.ts'
import type { ClassMembershipHistory, Jamaah, JamaahStatusHistory, MaterialCompletion } from '../types/domain.ts'

function warga(over: Partial<Jamaah> & { id: string }): Jamaah {
  return {
    id: over.id,
    fullName: over.fullName ?? `Warga ${over.id}`,
    gender: over.gender ?? 'Laki-laki',
    birthDate: over.birthDate ?? '2010-01-01',
    phone: over.phone ?? '',
    censusCategory: over.censusCategory ?? 'Remaja',
    active: over.active ?? true,
    classIds: over.classIds ?? [],
  }
}

function pindahKelas(over: Partial<ClassMembershipHistory> & { jamaahId: string; effectiveDate: string }): ClassMembershipHistory {
  return {
    id: over.id ?? `${over.jamaahId}-${over.effectiveDate}`,
    jamaahId: over.jamaahId,
    fromClassId: over.fromClassId ?? null,
    toClassId: over.toClassId ?? null,
    previousCensusCategory: over.previousCensusCategory ?? 'Pra Remaja',
    newCensusCategory: over.newCensusCategory ?? 'Remaja',
    effectiveDate: over.effectiveDate,
    changeType: over.changeType ?? 'promotion',
    notes: over.notes ?? '',
    changedBy: over.changedBy ?? null,
    createdAt: over.createdAt ?? `${over.effectiveDate}T00:00:00.000Z`,
  }
}

function ubahStatus(over: Partial<JamaahStatusHistory> & { jamaahId: string; effectiveDate: string }): JamaahStatusHistory {
  return {
    id: over.id ?? `${over.jamaahId}-s-${over.effectiveDate}`,
    jamaahId: over.jamaahId,
    previousActive: over.previousActive ?? true,
    newActive: over.newActive ?? false,
    reason: over.reason ?? 'moved',
    effectiveDate: over.effectiveDate,
    notes: over.notes ?? '',
    classIds: over.classIds ?? [],
    changedBy: over.changedBy ?? null,
    createdAt: over.createdAt ?? `${over.effectiveDate}T00:00:00.000Z`,
  }
}

// --- snapshot historis -------------------------------------------------------
// Inilah aturan yang dijaga: laporan bulan lalu tidak boleh ikut berubah ketika
// ada kenaikan kelas atau pengarsipan sesudahnya.

test('kenaikan kelas sesudah tanggal potret tidak mengubah laporan bulan itu', () => {
  const orang = warga({ id: 'w1', classIds: ['remaja'], censusCategory: 'Remaja' })
  const riwayat = [pindahKelas({
    jamaahId: 'w1', fromClassId: 'pra-remaja', toClassId: 'remaja',
    previousCensusCategory: 'Pra Remaja', effectiveDate: '2026-08-01',
  })]

  const sebelum = jamaahSnapshotsAsOfDate([orang], riwayat, [], '2026-07-31')[0]!
  assert.deepEqual(sebelum.classIds, ['pra-remaja'])
  assert.equal(sebelum.censusCategory, 'Pra Remaja')

  const sesudah = jamaahSnapshotsAsOfDate([orang], riwayat, [], '2026-08-31')[0]!
  assert.deepEqual(sesudah.classIds, ['remaja'])
  assert.equal(sesudah.censusCategory, 'Remaja')
})

test('warga yang diarsipkan sesudahnya tetap terhitung aktif pada bulan itu', () => {
  const orang = warga({ id: 'w1', classIds: [], active: false })
  const riwayat = [ubahStatus({
    jamaahId: 'w1', previousActive: true, newActive: false,
    classIds: ['remaja'], effectiveDate: '2026-09-15',
  })]

  const sebelum = jamaahSnapshotsAsOfDate([orang], [], riwayat, '2026-08-31')[0]!
  assert.equal(sebelum.active, true)
  assert.deepEqual(sebelum.classIds, ['remaja'])

  const sesudah = jamaahSnapshotsAsOfDate([orang], [], riwayat, '2026-09-30')[0]!
  assert.equal(sesudah.active, false)
})

test('tanggal efektif tepat pada tanggal potret dihitung sudah terjadi', () => {
  const orang = warga({ id: 'w1', classIds: ['remaja'] })
  const riwayat = [pindahKelas({ jamaahId: 'w1', fromClassId: 'pra-remaja', toClassId: 'remaja', effectiveDate: '2026-08-31' })]
  const potret = jamaahSnapshotsAsOfDate([orang], riwayat, [], '2026-08-31')[0]!
  assert.deepEqual(potret.classIds, ['remaja'])
})

test('warga tanpa riwayat sama sekali dikembalikan apa adanya', () => {
  const orang = warga({ id: 'w1', classIds: ['remaja'], censusCategory: 'Remaja' })
  const potret = jamaahSnapshotsAsOfDate([orang], [], [], '2020-01-01')[0]!
  assert.deepEqual(potret.classIds, ['remaja'])
  assert.equal(potret.active, true)
  assert.equal(potret.censusCategory, 'Remaja')
})

test('riwayat milik warga lain tidak ikut terpakai', () => {
  const orang = warga({ id: 'w1', classIds: ['remaja'] })
  const riwayat = [pindahKelas({ jamaahId: 'w2', fromClassId: 'pra-remaja', toClassId: 'remaja', effectiveDate: '2026-08-01' })]
  const potret = jamaahSnapshotsAsOfDate([orang], riwayat, [], '2026-07-31')[0]!
  assert.deepEqual(potret.classIds, ['remaja'])
})

test('beberapa perpindahan diputar mundur menurut urutan tanggal', () => {
  const orang = warga({ id: 'w1', classIds: ['pra-nikah'], censusCategory: 'Usia Nikah' })
  const riwayat = [
    pindahKelas({ jamaahId: 'w1', fromClassId: 'pra-remaja', toClassId: 'remaja', previousCensusCategory: 'Pra Remaja', effectiveDate: '2025-08-01' }),
    pindahKelas({ jamaahId: 'w1', fromClassId: 'remaja', toClassId: 'pra-nikah', previousCensusCategory: 'Remaja', effectiveDate: '2026-08-01' }),
  ]
  assert.deepEqual(jamaahSnapshotsAsOfDate([orang], riwayat, [], '2026-01-31')[0]!.classIds, ['remaja'])
  assert.deepEqual(jamaahSnapshotsAsOfDate([orang], riwayat, [], '2025-01-31')[0]!.classIds, ['pra-remaja'])
})

test('beberapa warga dipotret bersama tanpa saling mencemari', () => {
  const daftar = [
    warga({ id: 'w1', classIds: ['remaja'] }),
    warga({ id: 'w2', classIds: ['pra-nikah'], gender: 'Perempuan' }),
  ]
  const riwayat = [pindahKelas({ jamaahId: 'w1', fromClassId: 'pra-remaja', toClassId: 'remaja', effectiveDate: '2026-08-01' })]
  const [satu, dua] = jamaahSnapshotsAsOfDate(daftar, riwayat, [], '2026-07-31')
  assert.deepEqual(satu!.classIds, ['pra-remaja'])
  assert.deepEqual(dua!.classIds, ['pra-nikah'])
})

// --- rata-rata kehadiran -----------------------------------------------------

test('rata-rata kehadiran adalah rerata persentase tiap sesi, bukan rerata semua orang', () => {
  const sesi = [
    { statuses: { a: 'present', b: 'present' } },
    { statuses: { c: 'present', d: 'absent', e: 'absent', f: 'absent' } },
  ] as never
  // sesi 1 = 100%, sesi 2 = 25%, rerata = 63 (dibulatkan)
  assert.equal(averageAttendanceRate(sesi), 63)
})

test('tanpa sesi sama sekali hasilnya nol, bukan NaN', () => {
  assert.equal(averageAttendanceRate([]), 0)
})

test('sesi tanpa peserta tidak membuat pembagian nol', () => {
  assert.equal(averageAttendanceRate([{ statuses: {} }] as never), 0)
})

// --- progres ketuntasan materi ----------------------------------------------

const KELAS = new Map([['remaja', 'Remaja'], ['playgroup', 'Playgroup']])

function tuntas(jamaahId: string, materialType: 'hasda' | 'asad', month: string): MaterialCompletion {
  return { id: `${jamaahId}-${materialType}-${month}`, month, materialType, jamaahId, classId: 'remaja', source: 'main_session', completedOn: `${month}-01`, sourceSessionId: null }
}

test('hanya menghitung peserta yang wajib menerima materi', () => {
  const daftar = [
    warga({ id: 'w1', classIds: ['remaja'] }),      // wajib
    warga({ id: 'w2', classIds: ['playgroup'], censusCategory: 'Balita' }), // tidak wajib
  ]
  const hasil = materialProgressFor('hasda', daftar, [], '2026-10', new Set(['remaja', 'playgroup']), KELAS)
  assert.equal(hasil.total, 1)
})

test('ketuntasan bulan lain tidak ikut terhitung', () => {
  const daftar = [warga({ id: 'w1', classIds: ['remaja'] })]
  const hasil = materialProgressFor('hasda', daftar, [tuntas('w1', 'hasda', '2026-09')], '2026-10', new Set(['remaja']), KELAS)
  assert.equal(hasil.done, 0)
})

test('ketuntasan materi lain tidak ikut terhitung', () => {
  const daftar = [warga({ id: 'w1', classIds: ['remaja'] })]
  const hasil = materialProgressFor('hasda', daftar, [tuntas('w1', 'asad', '2026-10')], '2026-10', new Set(['remaja']), KELAS)
  assert.equal(hasil.done, 0)
})

test('warga nonaktif dan kelas di luar hak akses tidak ikut terhitung', () => {
  const daftar = [
    warga({ id: 'w1', classIds: ['remaja'], active: false }),
    warga({ id: 'w2', classIds: ['remaja'] }),
  ]
  assert.equal(materialProgressFor('hasda', daftar, [], '2026-10', new Set(['remaja']), KELAS).total, 1)
  assert.equal(materialProgressFor('hasda', daftar, [], '2026-10', new Set(['kelas-lain']), KELAS).total, 0)
})

test('catatan ketuntasan ganda tidak membuat hitungan melebihi jumlah peserta', () => {
  const daftar = [warga({ id: 'w1', classIds: ['remaja'] })]
  const ganda = [tuntas('w1', 'hasda', '2026-10'), { ...tuntas('w1', 'hasda', '2026-10'), id: 'lain' }]
  const hasil = materialProgressFor('hasda', daftar, ganda, '2026-10', new Set(['remaja']), KELAS)
  assert.deepEqual(hasil, { done: 1, total: 1, percent: 100 })
})

test('tanpa peserta sama sekali hasilnya nol semua, bukan NaN', () => {
  assert.deepEqual(materialProgressFor('hasda', [], [], '2026-10', new Set(), KELAS), { done: 0, total: 0, percent: 0 })
})

// --- bantuan tanggal dan persentase -----------------------------------------

test('monthEndDate tahu panjang tiap bulan termasuk tahun kabisat', () => {
  assert.equal(monthEndDate('2026-02'), '2026-02-28')
  assert.equal(monthEndDate('2028-02'), '2028-02-29')
  assert.equal(monthEndDate('2026-04'), '2026-04-30')
  assert.equal(monthEndDate('2026-12'), '2026-12-31')
})

test('percentage tidak membagi dengan nol', () => {
  assert.equal(percentage(0, 0), 0)
  assert.equal(percentage(1, 3), 33)
})
