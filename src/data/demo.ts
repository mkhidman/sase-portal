import type { AppUser, BootstrapData, Jamaah, StudyClass } from '../types/domain'
import { addIsoDays, localIsoDate, monthValue } from '../lib/utils'

export const DEMO_SUPERADMIN: AppUser = {
  id: 'user-superadmin',
  name: 'Superadmin SASE',
  email: 'superadmin@example.test',
  role: 'superadmin',
  assignedClassIds: [],
  active: true,
  mustChangePassword: false,
  lastLoginAt: new Date().toISOString(),
}

export const CLASS_IDS = {
  playgroup: 'class-playgroup',
  paud: 'class-paud',
  cabA: 'class-caberawit-a',
  cabB: 'class-caberawit-b',
  cabC: 'class-caberawit-c',
  praRemaja: 'class-pra-remaja',
  remaja: 'class-remaja',
  praNikah: 'class-pra-nikah',
  umum: 'class-pengajian-umum',
  ibu: 'class-pengajian-ibu',
  istimewa: 'class-usia-istimewa',
  limaUnsur: 'class-lima-unsur',
} as const

export const DEMO_ADMIN: AppUser = {
  id: 'user-admin-kelas',
  name: 'Admin Wali Kelas',
  email: 'admin@example.test',
  role: 'admin',
  assignedClassIds: [CLASS_IDS.cabA, CLASS_IDS.cabB, CLASS_IDS.praRemaja],
  active: true,
  mustChangePassword: false,
  lastLoginAt: new Date(Date.now() - 86400000).toISOString(),
}

export const DEMO_ADMIN_2: AppUser = {
  id: 'user-admin-umum',
  name: 'Admin Pengajian Umum',
  email: 'admin.umum@example.test',
  role: 'admin',
  assignedClassIds: [CLASS_IDS.umum, CLASS_IDS.ibu, CLASS_IDS.istimewa, CLASS_IDS.limaUnsur],
  active: true,
  mustChangePassword: true,
  lastLoginAt: null,
}

const classes: StudyClass[] = [
  { id: CLASS_IDS.playgroup, name: 'Playgroup', active: true },
  { id: CLASS_IDS.paud, name: 'PAUD', active: true },
  { id: CLASS_IDS.cabA, name: 'Caberawit Kelas A', active: true },
  { id: CLASS_IDS.cabB, name: 'Caberawit Kelas B', active: true },
  { id: CLASS_IDS.cabC, name: 'Caberawit Kelas C', active: true },
  { id: CLASS_IDS.praRemaja, name: 'Pra Remaja', active: true },
  { id: CLASS_IDS.remaja, name: 'Remaja', active: true },
  { id: CLASS_IDS.praNikah, name: 'Pra Nikah', active: true },
  { id: CLASS_IDS.umum, name: 'Pengajian Umum', active: true },
  { id: CLASS_IDS.ibu, name: 'Pengajian Ibu-Ibu', active: true },
  { id: CLASS_IDS.istimewa, name: 'Pengajian Usia Istimewa', active: true },
  { id: CLASS_IDS.limaUnsur, name: '5 Unsur', active: true },
]

const jamaah: Jamaah[] = [
  { id: 'j-01', fullName: 'Zahra Humaira', gender: 'Perempuan', birthDate: '2022-01-05', phone: '', censusCategory: 'Balita', active: true, classIds: [CLASS_IDS.playgroup] },
  { id: 'j-02', fullName: 'Muhammad Alif', gender: 'Laki-laki', birthDate: '2020-01-11', phone: '', censusCategory: 'Caberawit', active: true, classIds: [CLASS_IDS.paud] },
  { id: 'j-03', fullName: 'Fikri Ramadhan', gender: 'Laki-laki', birthDate: '2018-07-27', phone: '', censusCategory: 'Caberawit', active: true, classIds: [CLASS_IDS.cabA] },
  { id: 'j-04', fullName: 'Alya Syakira', gender: 'Perempuan', birthDate: '2017-04-12', phone: '', censusCategory: 'Caberawit', active: true, classIds: [CLASS_IDS.cabA] },
  { id: 'j-05', fullName: 'Nabila Azzahra', gender: 'Perempuan', birthDate: '2016-09-08', phone: '081234567802', censusCategory: 'Caberawit', active: true, classIds: [CLASS_IDS.cabB] },
  { id: 'j-06', fullName: 'Daffa Ardiansyah', gender: 'Laki-laki', birthDate: '2015-02-20', phone: '', censusCategory: 'Caberawit', active: true, classIds: [CLASS_IDS.cabB] },
  { id: 'j-07', fullName: 'Ahmad Fauzan', gender: 'Laki-laki', birthDate: '2014-04-14', phone: '081234567801', censusCategory: 'Caberawit', active: true, classIds: [CLASS_IDS.cabC] },
  { id: 'j-08', fullName: 'Salma Khairunnisa', gender: 'Perempuan', birthDate: '2013-05-29', phone: '', censusCategory: 'Caberawit', active: true, classIds: [CLASS_IDS.cabC] },
  { id: 'j-09', fullName: 'Siti Rahma', gender: 'Perempuan', birthDate: '2012-11-12', phone: '081234567804', censusCategory: 'Pra Remaja', active: true, classIds: [CLASS_IDS.praRemaja, CLASS_IDS.umum] },
  { id: 'j-10', fullName: 'Rafi Akbar', gender: 'Laki-laki', birthDate: '2011-08-03', phone: '', censusCategory: 'Pra Remaja', active: true, classIds: [CLASS_IDS.praRemaja, CLASS_IDS.umum] },
  { id: 'j-11', fullName: 'Rizky Maulana', gender: 'Laki-laki', birthDate: '2008-02-21', phone: '081234567803', censusCategory: 'Remaja', active: true, classIds: [CLASS_IDS.remaja, CLASS_IDS.umum, CLASS_IDS.limaUnsur] },
  { id: 'j-12', fullName: 'Nur Aisyah', gender: 'Perempuan', birthDate: '2009-07-18', phone: '081234567811', censusCategory: 'Remaja', active: true, classIds: [CLASS_IDS.remaja, CLASS_IDS.umum] },
  { id: 'j-13', fullName: 'Dedi Kurniawan', gender: 'Laki-laki', birthDate: '1998-12-03', phone: '081234567808', censusCategory: 'Usia Nikah', active: true, classIds: [CLASS_IDS.praNikah, CLASS_IDS.umum, CLASS_IDS.limaUnsur] },
  { id: 'j-14', fullName: 'Bagas Pratama', gender: 'Laki-laki', birthDate: '2001-10-01', phone: '081234567812', censusCategory: 'Usia Nikah', active: true, classIds: [CLASS_IDS.praNikah, CLASS_IDS.umum] },
  { id: 'j-15', fullName: 'Ibu Nurhayati', gender: 'Perempuan', birthDate: '1986-06-17', phone: '081234567805', censusCategory: 'Menikah', active: true, classIds: [CLASS_IDS.umum, CLASS_IDS.ibu, CLASS_IDS.limaUnsur] },
  { id: 'j-16', fullName: 'Bapak Hendra', gender: 'Laki-laki', birthDate: '1978-03-11', phone: '081234567806', censusCategory: 'Menikah', active: true, classIds: [CLASS_IDS.umum, CLASS_IDS.limaUnsur] },
  { id: 'j-17', fullName: 'Ibu Sulastri', gender: 'Perempuan', birthDate: '1965-03-19', phone: '081234567809', censusCategory: 'Menikah', active: true, classIds: [CLASS_IDS.umum, CLASS_IDS.ibu, CLASS_IDS.istimewa] },
  { id: 'j-18', fullName: 'Bapak Rahmat', gender: 'Laki-laki', birthDate: '1961-11-23', phone: '081234567810', censusCategory: 'Duda & Janda', active: true, classIds: [CLASS_IDS.umum, CLASS_IDS.istimewa] },
  { id: 'j-19', fullName: 'Andi Saputra', gender: 'Laki-laki', birthDate: '1995-09-14', phone: '081234567813', censusCategory: 'Usia Nikah', active: false, classIds: [] },
]

export function createDemoBootstrap(): BootstrapData {
  const today = localIsoDate()
  const month = monthValue()
  const session1Id = 'session-demo-1'
  const session2Id = 'session-demo-2'

  return {
    classes,
    jamaah,
    schedules: [
      { id: 'schedule-1', date: today, classId: CLASS_IDS.cabA, materialType: 'asad', materialName: '', notes: '' },
      { id: 'schedule-2', date: today, classId: CLASS_IDS.umum, materialType: 'hasda', materialName: '', notes: '' },
      { id: 'schedule-3', date: addIsoDays(1), classId: CLASS_IDS.ibu, materialType: 'general', materialName: '', notes: '' },
      { id: 'schedule-4', date: addIsoDays(3), classId: CLASS_IDS.praRemaja, materialType: 'hasda', materialName: '', notes: '' },
      { id: 'schedule-5', date: addIsoDays(5), classId: CLASS_IDS.limaUnsur, materialType: 'asad', materialName: '', notes: '' },
      { id: 'schedule-6', date: addIsoDays(7), classId: CLASS_IDS.cabB, materialType: 'asad', materialName: '', notes: '' },
    ],
    attendanceSessions: [
      {
        id: session1Id,
        date: addIsoDays(-7),
        classId: CLASS_IDS.cabA,
        materialType: 'general',
        materialName: 'Materi Umum',
        notes: 'Pembinaan rutin kelas.',
        statuses: { 'j-03': 'present', 'j-04': 'sick' },
        savedAt: new Date().toISOString(),
        revision: 1,
        generatedFromSessionId: null,
      },
      {
        id: session2Id,
        date: addIsoDays(-3),
        classId: CLASS_IDS.praRemaja,
        materialType: 'hasda',
        materialName: '',
        notes: 'Penyampaian target materi bulanan.',
        statuses: { 'j-09': 'present', 'j-10': 'absent' },
        savedAt: new Date().toISOString(),
        revision: 1,
        generatedFromSessionId: null,
      },
    ],
    materialCompletions: [
      { id: 'completion-1', month, materialType: 'hasda', jamaahId: 'j-09', classId: CLASS_IDS.praRemaja, source: 'main_session', completedOn: addIsoDays(-3), sourceSessionId: session2Id },
      { id: 'completion-2', month, materialType: 'hasda', jamaahId: 'j-10', classId: CLASS_IDS.praRemaja, source: 'follow_up', completedOn: addIsoDays(-1), sourceSessionId: null },
      { id: 'completion-3', month, materialType: 'asad', jamaahId: 'j-03', classId: CLASS_IDS.cabA, source: 'follow_up', completedOn: addIsoDays(-2), sourceSessionId: null },
    ],
    admins: [DEMO_ADMIN, DEMO_ADMIN_2],
    followUps: [
      { id: 'followup-demo-1', jamaahId: 'j-10', classId: CLASS_IDS.praRemaja, periodMonth: month, status: 'contacted', triggerType: 'consecutive_absence', attendanceRate: 0, absenceCount: 1, consecutiveAbsence: 1, notes: 'Sudah dihubungi wali untuk memastikan kondisi warga.', nextFollowUpDate: addIsoDays(2), recordedBy: DEMO_ADMIN.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ],
    reportingPeriods: [],
    classHistory: [
      { id: 'history-demo-1', jamaahId: 'j-09', fromClassId: CLASS_IDS.cabC, toClassId: CLASS_IDS.praRemaja, previousCensusCategory: 'Caberawit', newCensusCategory: 'Pra Remaja', effectiveDate: addIsoDays(-45), changeType: 'promotion', notes: 'Kenaikan kelas tahun ajaran sebelumnya.', changedBy: DEMO_SUPERADMIN.id, createdAt: new Date().toISOString() },
    ],
    statusHistory: [
      { id: 'status-history-demo-1', jamaahId: 'j-19', previousActive: true, newActive: false, reason: 'moved', effectiveDate: addIsoDays(-20), notes: 'Pindah domisili ke luar wilayah.', classIds: [CLASS_IDS.praNikah, CLASS_IDS.umum], changedBy: DEMO_SUPERADMIN.id, createdAt: new Date().toISOString() },
    ],
    families: [
      { id: 'family-demo-1', name: 'Keluarga Bapak Arif', address: 'Cikondang', notes: 'Kontak utama melalui orang tua.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'family-demo-2', name: 'Keluarga Ibu Lina', address: 'Sadang Serang', notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ],
    familyMembers: [
      { familyId: 'family-demo-1', jamaahId: 'j-03', relationship: 'Anak', isPrimaryContact: false },
      { familyId: 'family-demo-1', jamaahId: 'j-04', relationship: 'Anak', isPrimaryContact: false },
      { familyId: 'family-demo-2', jamaahId: 'j-05', relationship: 'Anak', isPrimaryContact: false },
    ],
    guardianContacts: [
      { id: 'guardian-demo-1', jamaahId: 'j-03', guardianJamaahId: 'j-16', fullName: 'Bapak Hendra', relationship: 'Ayah', phone: '081234567806', isPrimary: true, notes: 'Dapat dihubungi sore hari.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'guardian-demo-2', jamaahId: 'j-04', guardianJamaahId: 'j-16', fullName: 'Bapak Hendra', relationship: 'Ayah', phone: '081234567806', isPrimary: true, notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'guardian-demo-3', jamaahId: 'j-05', guardianJamaahId: 'j-15', fullName: 'Ibu Nurhayati', relationship: 'Ibu', phone: '081234567805', isPrimary: true, notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'guardian-demo-4', jamaahId: 'j-16', guardianJamaahId: 'j-16', fullName: 'Bapak Hendra', relationship: 'Diri Sendiri', phone: '081234567806', isPrimary: true, notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ],
    mergeHistory: [],
    auditLogs: [
      { id: 'audit-demo-1', actorId: DEMO_SUPERADMIN.id, actorName: DEMO_SUPERADMIN.name, actorEmail: DEMO_SUPERADMIN.email, action: 'insert', entityType: 'attendance_sessions', entityId: session2Id, summary: 'Menyimpan absensi Pra Remaja', metadata: {}, createdAt: new Date().toISOString() },
    ],
  }
}

const STORAGE_KEY = 'sensus-jamaah-development-v1'

export function loadDemoBootstrap(): BootstrapData {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) {
    const initial = createDemoBootstrap()
    saveDemoBootstrap(initial)
    return initial
  }
  try {
    const parsed = JSON.parse(stored) as BootstrapData
    return { ...parsed, schedules: (parsed.schedules ?? []).map((item) => ({ ...item, materialName: item.materialName ?? '', notes: item.notes ?? '' })), attendanceSessions: (parsed.attendanceSessions ?? []).map((item) => ({ ...item, materialName: item.materialName ?? '', notes: item.notes ?? '', revision: item.revision ?? 1, generatedFromSessionId: item.generatedFromSessionId ?? null })), admins: (parsed.admins ?? []).map((item) => ({ ...item, active: item.active ?? true, mustChangePassword: item.mustChangePassword ?? false, lastLoginAt: item.lastLoginAt ?? null })), auditLogs: parsed.auditLogs ?? [], followUps: parsed.followUps ?? [], reportingPeriods: parsed.reportingPeriods ?? [], classHistory: parsed.classHistory ?? [], statusHistory: parsed.statusHistory ?? [], families: parsed.families ?? [], familyMembers: parsed.familyMembers ?? [], guardianContacts: (parsed.guardianContacts ?? []).map((item) => ({ ...item, guardianJamaahId: item.guardianJamaahId ?? null })), mergeHistory: parsed.mergeHistory ?? [] }
  } catch {
    const initial = createDemoBootstrap()
    saveDemoBootstrap(initial)
    return initial
  }
}

export function saveDemoBootstrap(data: BootstrapData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function resetDemoBootstrap(): BootstrapData {
  const data = createDemoBootstrap()
  saveDemoBootstrap(data)
  return data
}
