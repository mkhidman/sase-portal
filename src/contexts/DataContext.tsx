import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  AttendanceSession,
  AttendanceStatus,
  BootstrapData,
  CensusCategory,
  ClassMembershipHistory,
  Family,
  GuardianContact,
  Jamaah,
  JamaahFollowUp,
  JamaahStatusHistory,
  MaterialCompletion,
  MaterialType,
  ReportingPeriodStatus,
  Schedule,
  StudyClass,
} from '../types/domain'
import {
  loadBootstrap,
  persistDemo,
  removeAttendanceSession,
  removeMaterialCompletion,
  upsertAttendanceSession,
  upsertJamaah,
  importJamaahBatch,
  upsertMaterialCompletion,
  upsertSchedule,
  createAdmin,
  updateAdminAssignments,
  setAdminActiveStatus,
  resetAdminPassword as resetAdminPasswordRepository,
  transferAdminAssignments,
  upsertJamaahFollowUp,
  removeJamaahFollowUp,
  upsertReportingPeriod,
  bulkTransitionJamaahClasses,
  changeJamaahStatus,
  upsertFamily,
  removeFamily,
  upsertGuardianContact,
  removeGuardianContact,
  type ClassTransitionInput,
  type JamaahStatusChangeInput,
  type SaveFamilyInput,
  type CreateAdminInput,
  type MergeJamaahInput,
  mergeJamaahDuplicates,
} from '../data/repository'
import { resetDemoBootstrap } from '../data/demo'
import { useAuth } from './AuthContext'
import { isDemoMode, supabase } from '../lib/supabase'
import { censusCategoryForClassName, isEligibleForMaterial, isMandatoryMaterial, localIsoDate } from '../lib/utils'
import { loadBootstrapCache, saveBootstrapCache } from '../lib/offline'
import { mergeDemoJamaah } from '../lib/mergeJamaah'

interface SaveAttendanceInput {
  id?: string
  date: string
  classId: string
  materialType: MaterialType
  materialName: string
  notes: string
  statuses: Record<string, AttendanceStatus>
  expectedRevision?: number
}

interface DataContextValue extends BootstrapData {
  loading: boolean
  error: string | null
  usingCachedData: boolean
  lastSyncedAt: string | null
  visibleClasses: StudyClass[]
  visibleJamaah: Jamaah[]
  reload: () => Promise<void>
  saveJamaah: (jamaah: Jamaah) => Promise<void>
  importJamaah: (jamaah: Jamaah[]) => Promise<number>
  saveSchedule: (schedule: Schedule) => Promise<void>
  saveAttendance: (input: SaveAttendanceInput) => Promise<AttendanceSession>
  deleteAttendance: (sessionId: string) => Promise<void>
  toggleFollowUp: (month: string, materialType: 'hasda' | 'asad', jamaahId: string, classId: string | null) => Promise<void>
  addAdmin: (input: CreateAdminInput) => Promise<void>
  saveAdminAssignments: (adminId: string, classIds: string[]) => Promise<void>
  setAdminActive: (adminId: string, active: boolean, replacementAdminId?: string | null, classIds?: string[]) => Promise<void>
  resetAdminPassword: (adminId: string, temporaryPassword: string) => Promise<void>
  transferAdminClasses: (sourceAdminId: string, targetAdminId: string, classIds: string[]) => Promise<void>
  saveJamaahFollowUp: (followUp: JamaahFollowUp) => Promise<void>
  setReportingPeriodStatus: (month: string, status: ReportingPeriodStatus, notes?: string) => Promise<void>
  isPeriodClosed: (month: string) => boolean
  deleteJamaahFollowUp: (followUpId: string) => Promise<void>
  applyClassTransition: (input: ClassTransitionInput) => Promise<number>
  setJamaahActiveStatus: (input: JamaahStatusChangeInput) => Promise<void>
  saveFamily: (input: SaveFamilyInput) => Promise<void>
  deleteFamily: (familyId: string) => Promise<void>
  saveGuardianContact: (contact: GuardianContact) => Promise<void>
  deleteGuardianContact: (contactId: string) => Promise<void>
  mergeDuplicateJamaah: (input: MergeJamaahInput) => Promise<void>
  resetDemo: () => void
}

const EMPTY: BootstrapData = {
  classes: [],
  jamaah: [],
  schedules: [],
  attendanceSessions: [],
  materialCompletions: [],
  admins: [],
  auditLogs: [],
  followUps: [],
  reportingPeriods: [],
  classHistory: [],
  statusHistory: [],
  families: [],
  familyMembers: [],
  guardianContacts: [],
  mergeHistory: [],
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [data, setData] = useState<BootstrapData>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usingCachedData, setUsingCachedData] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!user) {
      setData(EMPTY)
      setUsingCachedData(false)
      setLastSyncedAt(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const loaded = await loadBootstrap(user)
      setData(loaded)
      saveBootstrapCache(user.id, loaded)
      setUsingCachedData(false)
      setLastSyncedAt(new Date().toISOString())
    } catch (cause) {
      const cached = loadBootstrapCache(user.id)
      if (cached) {
        setData({ ...cached.data, admins: (cached.data.admins ?? []).map((admin) => ({ ...admin, active: admin.active ?? true, mustChangePassword: admin.mustChangePassword ?? false, lastLoginAt: admin.lastLoginAt ?? null })), auditLogs: cached.data.auditLogs ?? [], followUps: cached.data.followUps ?? [], reportingPeriods: cached.data.reportingPeriods ?? [], classHistory: cached.data.classHistory ?? [], statusHistory: cached.data.statusHistory ?? [], families: cached.data.families ?? [], familyMembers: cached.data.familyMembers ?? [], guardianContacts: cached.data.guardianContacts ?? [], mergeHistory: cached.data.mergeHistory ?? [] })
        setUsingCachedData(true)
        setLastSyncedAt(cached.cachedAt)
        setError('Koneksi tidak tersedia. Menampilkan data terakhir yang tersimpan di perangkat.')
      } else {
        setError(cause instanceof Error ? cause.message : 'Gagal mengambil data.')
      }
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!user) return
    const handleOnline = () => void reload()
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [reload, user])

  useEffect(() => {
    if (isDemoMode || !supabase || !user) return
    const realtimeClient = supabase
    let timer: number | undefined
    const scheduleReload = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void reload(), 350)
    }
    const channel = realtimeClient
      .channel(`sensus-jamaah-live-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jamaah' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jamaah_classes' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_completions' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_class_assignments' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jamaah_follow_ups' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reporting_periods' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_membership_history' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jamaah_status_history' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'families' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_members' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guardian_contacts' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jamaah_merge_history' }, scheduleReload)
      .subscribe()
    return () => {
      window.clearTimeout(timer)
      void realtimeClient.removeChannel(channel)
    }
  }, [reload, user])

  const updateData = useCallback(async (updater: (current: BootstrapData) => BootstrapData) => {
    setData((current) => {
      const next = updater(current)
      void persistDemo(next)
      if (user) saveBootstrapCache(user.id, next)
      return next
    })
  }, [user])

  const visibleClasses = useMemo(() => {
    if (!user) return []
    if (user.role === 'superadmin') return data.classes.filter((item) => item.active)
    return data.classes.filter((item) => item.active && user.assignedClassIds.includes(item.id))
  }, [data.classes, user])

  const visibleJamaah = useMemo(() => {
    if (!user) return []
    if (user.role === 'superadmin') return data.jamaah.filter((item) => item.active)
    return data.jamaah.filter(
      (item) => item.active && item.classIds.some((classId) => user.assignedClassIds.includes(classId)),
    )
  }, [data.jamaah, user])

  const isPeriodClosed = useCallback((month: string) => {
    return data.reportingPeriods.some((period) => period.month === month && period.status === 'closed')
  }, [data.reportingPeriods])

  const value = useMemo<DataContextValue>(
    () => ({
      ...data,
      loading,
      error,
      usingCachedData,
      lastSyncedAt,
      visibleClasses,
      visibleJamaah,
      reload,
      async saveJamaah(input) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat mengubah sensus.')
        const saved = await upsertJamaah(input)
        await updateData((current) => ({
          ...current,
          jamaah: current.jamaah.some((item) => item.id === input.id)
            ? current.jamaah.map((item) => (item.id === input.id ? saved : item))
            : [...current.jamaah, saved],
        }))
      },
      async importJamaah(items) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat mengimpor data sensus.')
        const saved = await importJamaahBatch(items)
        if (!isDemoMode) {
          await reload()
          return saved.length
        }

        const now = new Date().toISOString()
        const inactiveHistories: JamaahStatusHistory[] = saved
          .filter((item) => !item.active)
          .map((item) => ({
            id: crypto.randomUUID(),
            jamaahId: item.id,
            previousActive: true,
            newActive: false,
            reason: 'other',
            effectiveDate: localIsoDate(),
            notes: 'Diimpor sebagai data nonaktif.',
            classIds: [...item.classIds],
            changedBy: user.id,
            createdAt: now,
          }))
        const normalized = saved.map((item) => item.active ? item : { ...item, classIds: [] })
        await updateData((current) => ({
          ...current,
          jamaah: [...current.jamaah, ...normalized],
          statusHistory: [...inactiveHistories, ...current.statusHistory],
        }))
        return saved.length
      },
      async saveSchedule(input) {
        if (isPeriodClosed(input.date.slice(0, 7))) throw new Error('Periode bulan ini sudah ditutup. Buka kembali periode dari Laporan Bulanan untuk melakukan perubahan.')
        if (!visibleClasses.some((item) => item.id === input.classId)) throw new Error('Anda hanya dapat membuat jadwal untuk kelas yang diampu.')
        const saved = await upsertSchedule(input)
        await updateData((current) => ({
          ...current,
          schedules: current.schedules.some((item) => item.id === input.id)
            ? current.schedules.map((item) => (item.id === input.id ? saved : item))
            : [...current.schedules, saved],
        }))
      },
      async saveAttendance(input) {
        if (isPeriodClosed(input.date.slice(0, 7))) throw new Error('Periode bulan ini sudah ditutup. Absensi tidak dapat diubah.')
        const existing = data.attendanceSessions.find(
          (item) =>
            item.id === input.id ||
            (item.date === input.date && item.classId === input.classId && item.materialType === input.materialType && item.materialName === input.materialName),
        )
        const session: AttendanceSession = {
          id: existing?.id ?? crypto.randomUUID(),
          date: input.date,
          classId: input.classId,
          materialType: input.materialType,
          materialName: input.materialName,
          notes: input.notes,
          statuses: input.statuses,
          savedAt: new Date().toISOString(),
          revision: existing?.revision ?? 0,
        }

        const linked = data.materialCompletions.filter(
          (completion) => completion.sourceSessionId === existing?.id && completion.source === 'main_session',
        )
        const saved = await upsertAttendanceSession(session, input.expectedRevision ?? existing?.revision ?? 0)
        await Promise.all(linked.map((completion) => removeMaterialCompletion(completion.id)))

        const classNameMap = new Map(data.classes.map((item) => [item.id, item.name]))
        const addedCompletions: MaterialCompletion[] = []
        if (isMandatoryMaterial(saved.materialType)) {
          const month = saved.date.slice(0, 7)
          for (const [jamaahId, status] of Object.entries(saved.statuses)) {
            const person = data.jamaah.find((item) => item.id === jamaahId)
            if (status !== 'present' || !person || !isEligibleForMaterial(saved.materialType, person, classNameMap)) continue
            const completion = await upsertMaterialCompletion({
              id: crypto.randomUUID(),
              month,
              materialType: saved.materialType,
              jamaahId,
              classId: saved.classId,
              source: 'main_session',
              completedOn: saved.date,
              sourceSessionId: saved.id,
            })
            addedCompletions.push(completion)
          }
        }

        await updateData((current) => ({
          ...current,
          attendanceSessions: current.attendanceSessions.some((item) => item.id === saved.id)
            ? current.attendanceSessions.map((item) => (item.id === saved.id ? saved : item))
            : [saved, ...current.attendanceSessions],
          materialCompletions: [
            ...current.materialCompletions.filter((item) => item.sourceSessionId !== existing?.id),
            ...addedCompletions,
          ],
        }))
        return saved
      },
      async deleteAttendance(sessionId) {
        const targetSession = data.attendanceSessions.find((item) => item.id === sessionId)
        if (targetSession && isPeriodClosed(targetSession.date.slice(0, 7))) throw new Error('Periode bulan ini sudah ditutup. Absensi tidak dapat dihapus.')
        await removeAttendanceSession(sessionId)
        await updateData((current) => ({
          ...current,
          attendanceSessions: current.attendanceSessions.filter((item) => item.id !== sessionId),
          materialCompletions: current.materialCompletions.filter((item) => item.sourceSessionId !== sessionId),
        }))
      },
      async toggleFollowUp(month, materialType, jamaahId, classId) {
        if (isPeriodClosed(month)) throw new Error('Periode bulan ini sudah ditutup. Ketuntasan materi tidak dapat diubah.')
        const existing = data.materialCompletions.find(
          (item) => item.month === month && item.materialType === materialType && item.jamaahId === jamaahId,
        )
        if (existing) {
          await removeMaterialCompletion(existing.id)
          await updateData((current) => ({
            ...current,
            materialCompletions: current.materialCompletions.filter((item) => item.id !== existing.id),
          }))
          return
        }
        const completion = await upsertMaterialCompletion({
          id: crypto.randomUUID(),
          month,
          materialType,
          jamaahId,
          classId,
          source: 'follow_up',
          completedOn: localIsoDate(),
          sourceSessionId: null,
        })
        await updateData((current) => ({
          ...current,
          materialCompletions: [...current.materialCompletions, completion],
        }))
      },
      async addAdmin(input) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat membuat Admin.')
        if (isDemoMode) {
          const id = await createAdmin(input)
          await updateData((current) => ({
            ...current,
            admins: [...current.admins, { id, name: input.fullName, email: input.email, role: 'admin', assignedClassIds: input.classIds, active: true, mustChangePassword: true, lastLoginAt: null }],
          }))
          return
        }
        await createAdmin(input)
        await reload()
      },
      async saveAdminAssignments(adminId, classIds) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat mengubah penugasan Admin.')
        await updateAdminAssignments(adminId, classIds)
        await updateData((current) => ({
          ...current,
          admins: current.admins.map((admin) => admin.id === adminId ? { ...admin, assignedClassIds: classIds } : admin),
        }))
      },
      async setAdminActive(adminId, active, replacementAdminId, classIds = []) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat mengubah status akun Admin.')
        const target = data.admins.find((admin) => admin.id === adminId)
        if (!target) throw new Error('Akun Admin tidak ditemukan.')
        if (target.active === active) throw new Error(active ? 'Akun sudah aktif.' : 'Akun sudah nonaktif.')
        if (active && !classIds.length) throw new Error('Pilih minimal satu kelas saat mengaktifkan kembali Admin.')
        await setAdminActiveStatus({ adminId, active, replacementAdminId, classIds })
        if (!isDemoMode) {
          await reload()
          return
        }
        await updateData((current) => {
          const targetClasses = target.assignedClassIds
          return {
            ...current,
            admins: current.admins.map((admin) => {
              if (admin.id === adminId) return { ...admin, active, assignedClassIds: active ? classIds : [] }
              if (!active && replacementAdminId && admin.id === replacementAdminId) {
                return { ...admin, assignedClassIds: [...new Set([...admin.assignedClassIds, ...targetClasses])] }
              }
              return admin
            }),
          }
        })
      },
      async resetAdminPassword(adminId, temporaryPassword) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat mereset password Admin.')
        if (temporaryPassword.length < 8) throw new Error('Password sementara minimal 8 karakter.')
        await resetAdminPasswordRepository(adminId, temporaryPassword)
        await updateData((current) => ({
          ...current,
          admins: current.admins.map((admin) => admin.id === adminId ? { ...admin, mustChangePassword: true } : admin),
        }))
      },
      async transferAdminClasses(sourceAdminId, targetAdminId, classIds) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat memindahkan penugasan kelas.')
        if (sourceAdminId === targetAdminId) throw new Error('Admin asal dan tujuan harus berbeda.')
        if (!classIds.length) throw new Error('Pilih minimal satu kelas yang akan dipindahkan.')
        await transferAdminAssignments(sourceAdminId, targetAdminId, classIds)
        await updateData((current) => ({
          ...current,
          admins: current.admins.map((admin) => {
            if (admin.id === sourceAdminId) return { ...admin, assignedClassIds: admin.assignedClassIds.filter((id) => !classIds.includes(id)) }
            if (admin.id === targetAdminId) return { ...admin, assignedClassIds: [...new Set([...admin.assignedClassIds, ...classIds])] }
            return admin
          }),
        }))
      },
      async saveJamaahFollowUp(input) {
        if (isPeriodClosed(input.periodMonth)) throw new Error('Periode bulan ini sudah ditutup. Catatan tindak lanjut tidak dapat diubah.')
        if (!visibleClasses.some((item) => item.id === input.classId)) throw new Error('Anda tidak memiliki akses ke kelas ini.')
        const saved = await upsertJamaahFollowUp(input)
        await updateData((current) => ({
          ...current,
          followUps: current.followUps.some((item) => item.id === saved.id || (item.jamaahId === saved.jamaahId && item.classId === saved.classId && item.periodMonth === saved.periodMonth))
            ? current.followUps.map((item) => (item.id === saved.id || (item.jamaahId === saved.jamaahId && item.classId === saved.classId && item.periodMonth === saved.periodMonth) ? saved : item))
            : [saved, ...current.followUps],
        }))
      },
      async deleteJamaahFollowUp(followUpId) {
        const existing = data.followUps.find((item) => item.id === followUpId)
        if (existing && isPeriodClosed(existing.periodMonth)) throw new Error('Periode bulan ini sudah ditutup. Catatan tindak lanjut tidak dapat dihapus.')
        if (!existing || !visibleClasses.some((item) => item.id === existing.classId)) throw new Error('Data tindak lanjut tidak ditemukan atau tidak dapat diakses.')
        await removeJamaahFollowUp(followUpId)
        await updateData((current) => ({ ...current, followUps: current.followUps.filter((item) => item.id !== followUpId) }))
      },
      async setReportingPeriodStatus(month, status, notes) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat menutup atau membuka periode.')
        const saved = await upsertReportingPeriod({ month, status, notes })
        await updateData((current) => ({
          ...current,
          reportingPeriods: current.reportingPeriods.some((item) => item.month === month)
            ? current.reportingPeriods.map((item) => item.month === month ? saved : item)
            : [saved, ...current.reportingPeriods],
        }))
      },
      async applyClassTransition(input) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat melakukan kenaikan atau mutasi kelas.')
        if (!input.jamaahIds.length) throw new Error('Pilih minimal satu warga.')
        if (input.fromClassId === input.toClassId) throw new Error('Kelas asal dan kelas tujuan harus berbeda.')
        if (isPeriodClosed(input.effectiveDate.slice(0, 7))) throw new Error('Periode tanggal efektif sudah ditutup.')

        if (!isDemoMode) {
          const count = await bulkTransitionJamaahClasses(input)
          await reload()
          return count
        }

        const sourceClass = data.classes.find((item) => item.id === input.fromClassId)
        const targetClass = data.classes.find((item) => item.id === input.toClassId)
        if (!sourceClass || !targetClass) throw new Error('Kelas asal atau kelas tujuan tidak ditemukan.')
        const selectedSet = new Set(input.jamaahIds)
        const now = new Date().toISOString()
        const histories: ClassMembershipHistory[] = []
        let changed = 0

        const nextJamaah = data.jamaah.map((person) => {
          if (!selectedSet.has(person.id) || !person.classIds.includes(input.fromClassId)) return person
          const nextCategory: CensusCategory = input.updateCensusCategory
            ? censusCategoryForClassName(targetClass.name, person.censusCategory)
            : person.censusCategory
          const nextClassIds = [...new Set([...person.classIds.filter((id) => id !== input.fromClassId), input.toClassId])]
          histories.push({
            id: crypto.randomUUID(),
            jamaahId: person.id,
            fromClassId: input.fromClassId,
            toClassId: input.toClassId,
            previousCensusCategory: person.censusCategory,
            newCensusCategory: nextCategory,
            effectiveDate: input.effectiveDate,
            changeType: input.changeType,
            notes: input.notes,
            changedBy: user.id,
            createdAt: now,
          })
          changed += 1
          return { ...person, classIds: nextClassIds, censusCategory: nextCategory }
        })

        await updateData((current) => ({
          ...current,
          jamaah: nextJamaah,
          classHistory: [...histories, ...current.classHistory],
        }))
        return changed
      },
      async setJamaahActiveStatus(input) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat mengubah status warga.')
        if (isPeriodClosed(input.effectiveDate.slice(0, 7))) throw new Error('Periode tanggal efektif sudah ditutup.')
        const person = data.jamaah.find((item) => item.id === input.jamaahId)
        if (!person) throw new Error('Data warga tidak ditemukan.')
        if (person.active === input.active) throw new Error(input.active ? 'Warga sudah aktif.' : 'Warga sudah nonaktif.')
        if (input.active && !input.classIds.length) throw new Error('Pilih minimal satu kelas ketika mengaktifkan kembali warga.')

        if (!isDemoMode) {
          await changeJamaahStatus(input)
          await reload()
          return
        }

        const now = new Date().toISOString()
        const retainedClassIds = input.active ? [...new Set(input.classIds)] : [...person.classIds]
        const history: JamaahStatusHistory = {
          id: crypto.randomUUID(),
          jamaahId: person.id,
          previousActive: person.active,
          newActive: input.active,
          reason: input.reason,
          effectiveDate: input.effectiveDate,
          notes: input.notes,
          classIds: retainedClassIds,
          changedBy: user.id,
          createdAt: now,
        }
        await updateData((current) => ({
          ...current,
          jamaah: current.jamaah.map((item) => item.id === person.id
            ? { ...item, active: input.active, classIds: input.active ? retainedClassIds : [] }
            : item),
          statusHistory: [history, ...current.statusHistory],
        }))
      },
      async saveFamily(input) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat mengubah data keluarga.')
        if (!input.family.name.trim()) throw new Error('Nama keluarga wajib diisi.')
        if (!input.members.length) throw new Error('Pilih minimal satu warga sebagai anggota keluarga.')
        const memberIds = new Set(input.members.map((item) => item.jamaahId))
        const conflict = data.familyMembers.find((item) => memberIds.has(item.jamaahId) && item.familyId !== input.family.id)
        if (conflict) {
          const person = data.jamaah.find((item) => item.id === conflict.jamaahId)
          throw new Error(`${person?.fullName ?? 'Warga'} sudah terdaftar pada keluarga lain.`)
        }
        const saved = await upsertFamily(input)
        await updateData((current) => ({
          ...current,
          families: current.families.some((item) => item.id === input.family.id)
            ? current.families.map((item) => item.id === input.family.id ? saved.family : item)
            : [...current.families, saved.family],
          familyMembers: [
            ...current.familyMembers.filter((item) => item.familyId !== input.family.id && item.familyId !== saved.family.id),
            ...saved.members,
          ],
        }))
      },
      async deleteFamily(familyId) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat menghapus data keluarga.')
        const family = data.families.find((item) => item.id === familyId)
        if (!family) throw new Error('Data keluarga tidak ditemukan.')
        await removeFamily(familyId)
        await updateData((current) => ({
          ...current,
          families: current.families.filter((item) => item.id !== familyId),
          familyMembers: current.familyMembers.filter((item) => item.familyId !== familyId),
        }))
      },
      async saveGuardianContact(input) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat mengubah kontak wali.')
        if (!input.fullName.trim()) throw new Error('Nama kontak wali wajib diisi.')
        if (!input.phone.trim()) throw new Error('Nomor WhatsApp kontak wali wajib diisi.')
        if (!data.jamaah.some((item) => item.id === input.jamaahId)) throw new Error('Data warga tidak ditemukan.')
        const saved = await upsertGuardianContact(input)
        await updateData((current) => ({
          ...current,
          guardianContacts: [
            ...current.guardianContacts
              .filter((item) => item.id !== input.id && item.id !== saved.id)
              .map((item) => saved.isPrimary && item.jamaahId === saved.jamaahId ? { ...item, isPrimary: false } : item),
            saved,
          ],
        }))
      },
      async deleteGuardianContact(contactId) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat menghapus kontak wali.')
        if (!data.guardianContacts.some((item) => item.id === contactId)) throw new Error('Kontak wali tidak ditemukan.')
        await removeGuardianContact(contactId)
        await updateData((current) => ({
          ...current,
          guardianContacts: current.guardianContacts.filter((item) => item.id !== contactId),
        }))
      },
      async mergeDuplicateJamaah(input) {
        if (user?.role !== 'superadmin') throw new Error('Hanya Superadmin yang dapat menggabungkan data warga.')
        if (input.primaryJamaahId === input.duplicateJamaahId) throw new Error('Data utama dan data duplikat harus berbeda.')
        const primary = data.jamaah.find((item) => item.id === input.primaryJamaahId)
        const duplicate = data.jamaah.find((item) => item.id === input.duplicateJamaahId)
        if (!primary || !duplicate) throw new Error('Salah satu data warga tidak ditemukan.')
        if (!input.mergedProfile.fullName.trim()) throw new Error('Nama hasil penggabungan wajib diisi.')

        const result = await mergeJamaahDuplicates(input)
        if (!isDemoMode) {
          await reload()
          return
        }
        await updateData((current) => mergeDemoJamaah(current, input, result, user.id))
      },
      isPeriodClosed,
      resetDemo() {
        if (!isDemoMode) return
        setData(resetDemoBootstrap())
      },
    }),
    [data, error, isPeriodClosed, lastSyncedAt, loading, reload, updateData, user, usingCachedData, visibleClasses, visibleJamaah],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const value = useContext(DataContext)
  if (!value) throw new Error('useData harus digunakan di dalam DataProvider.')
  return value
}
