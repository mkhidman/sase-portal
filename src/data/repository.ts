import { isDemoMode, supabase } from '../lib/supabase'
import type {
  AppUser,
  AuditLog,
  AttendanceSession,
  BootstrapData,
  ClassChangeType,
  ClassMembershipHistory,
  Family,
  FamilyMember,
  GuardianContact,
  Jamaah,
  JamaahFollowUp,
  JamaahStatusHistory,
  JamaahStatusReason,
  JamaahMergeHistory,
  MaterialCompletion,
  ReportingPeriod,
  ReportingPeriodStatus,
  Schedule,
  StudyClass,
} from '../types/domain'
import { loadDemoBootstrap, saveDemoBootstrap } from './demo'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.')
  return supabase
}

const DATA_PAGE_SIZE = 500

async function fetchAllRows<T>(buildQuery: () => any): Promise<{ data: T[]; error: any }> {
  const rows: T[] = []
  for (let from = 0; ; from += DATA_PAGE_SIZE) {
    const result = await buildQuery().range(from, from + DATA_PAGE_SIZE - 1)
    if (result.error) return { data: rows, error: result.error }
    const page = (result.data ?? []) as T[]
    rows.push(...page)
    if (page.length < DATA_PAGE_SIZE) return { data: rows, error: null }
  }
}

type ProfileRow = {
  id: string
  full_name: string
  email: string
  role: 'superadmin' | 'admin'
  active?: boolean
  must_change_password?: boolean
  last_login_at?: string | null
  admin_class_assignments?: Array<{ class_id: string }>
}

export async function loadBootstrap(user: AppUser): Promise<BootstrapData> {
  if (isDemoMode) return loadDemoBootstrap()

  const client = requireSupabase()
  const [classesResult, jamaahResult, schedulesResult, sessionsResult, completionsResult, followUpsResult, periodsResult, classHistoryResult, statusHistoryResult, familiesResult, familyMembersResult, guardianContactsResult, mergeHistoryResult] = await Promise.all([
    fetchAllRows(() => client.from('study_classes').select('id,name,active').order('sort_order').order('id')),
    fetchAllRows(() => client.from('jamaah').select('id,full_name,gender,birth_date,phone,census_category,active,jamaah_classes(class_id)').order('full_name').order('id')),
    fetchAllRows(() => client.from('schedules').select('id,date,class_id,material_type,material_name,notes').order('date').order('id')),
    fetchAllRows(() => client.from('attendance_sessions').select('id,date,class_id,material_type,material_name,notes,saved_at,revision,attendance_records(jamaah_id,status)').order('date', { ascending: false }).order('id')),
    fetchAllRows(() => client.from('material_completions').select('id,month,material_type,jamaah_id,class_id,source,completed_on,source_session_id').order('id')),
    fetchAllRows(() => client.from('jamaah_follow_ups').select('id,jamaah_id,class_id,period_month,status,trigger_type,attendance_rate,absence_count,consecutive_absence,notes,next_follow_up_date,recorded_by,created_at,updated_at').order('id')),
    fetchAllRows(() => client.from('reporting_periods').select('id,month,status,closed_at,closed_by,notes,created_at,updated_at').order('month', { ascending: false }).order('id')),
    fetchAllRows(() => client.from('class_membership_history').select('id,jamaah_id,from_class_id,to_class_id,previous_census_category,new_census_category,effective_date,change_type,notes,changed_by,created_at').order('effective_date', { ascending: false }).order('created_at', { ascending: false }).order('id')),
    fetchAllRows(() => client.from('jamaah_status_history').select('id,jamaah_id,previous_active,new_active,reason,effective_date,notes,class_ids,changed_by,created_at').order('effective_date', { ascending: false }).order('created_at', { ascending: false }).order('id')),
    fetchAllRows(() => client.from('families').select('id,name,address,notes,created_at,updated_at').order('name').order('id')),
    fetchAllRows(() => client.from('family_members').select('family_id,jamaah_id,relationship,is_primary_contact').order('family_id').order('jamaah_id')),
    fetchAllRows(() => client.from('guardian_contacts').select('id,jamaah_id,guardian_jamaah_id,full_name,relationship,phone,is_primary,notes,created_at,updated_at').order('is_primary', { ascending: false }).order('full_name').order('id')),
    fetchAllRows(() => client.from('jamaah_merge_history').select('id,primary_jamaah_id,duplicate_jamaah_id,primary_name,duplicate_name,merged_profile,duplicate_snapshot,moved_counts,family_conflict,merged_by,merged_at').order('merged_at', { ascending: false }).order('id')),
  ])

  const coreResults = [classesResult, jamaahResult, schedulesResult, sessionsResult, completionsResult]
  const firstError = coreResults.find((result) => result.error)?.error
  if (firstError) throw firstError
  if (followUpsResult.error && !['42P01', 'PGRST205'].includes(followUpsResult.error.code)) throw followUpsResult.error
  if (periodsResult.error && !['42P01', 'PGRST205'].includes(periodsResult.error.code)) throw periodsResult.error
  if (classHistoryResult.error && !['42P01', 'PGRST205'].includes(classHistoryResult.error.code)) throw classHistoryResult.error
  if (statusHistoryResult.error && !['42P01', 'PGRST205'].includes(statusHistoryResult.error.code)) throw statusHistoryResult.error
  if (familiesResult.error && !['42P01', 'PGRST205'].includes(familiesResult.error.code)) throw familiesResult.error
  if (familyMembersResult.error && !['42P01', 'PGRST205'].includes(familyMembersResult.error.code)) throw familyMembersResult.error
  if (guardianContactsResult.error && !['42P01', 'PGRST205'].includes(guardianContactsResult.error.code)) throw guardianContactsResult.error
  if (mergeHistoryResult.error && !['42P01', 'PGRST205'].includes(mergeHistoryResult.error.code)) throw mergeHistoryResult.error

  let admins: AppUser[] = []
  let auditLogs: AuditLog[] = []
  if (user.role === 'superadmin') {
    const result = await client
      .from('profiles')
      .select('id,full_name,email,role,active,must_change_password,last_login_at,admin_class_assignments(class_id)')
      .eq('role', 'admin')
      .order('full_name')
    if (result.error) throw result.error
    admins = ((result.data ?? []) as ProfileRow[]).map((profile) => ({
      id: profile.id,
      name: profile.full_name,
      email: profile.email,
      role: profile.role,
      assignedClassIds: profile.admin_class_assignments?.map((item) => item.class_id) ?? [],
      active: profile.active ?? true,
      mustChangePassword: profile.must_change_password ?? false,
      lastLoginAt: profile.last_login_at ?? null,
    }))

    const auditResult = await client
      .from('audit_logs')
      .select('id,actor_id,actor_name,actor_email,action,entity_type,entity_id,summary,metadata,created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (auditResult.error && auditResult.error.code !== '42P01') throw auditResult.error
    auditLogs = (auditResult.data ?? []).map((row: any) => ({
      id: row.id,
      actorId: row.actor_id,
      actorName: row.actor_name || 'Sistem',
      actorEmail: row.actor_email || '',
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      summary: row.summary || 'Perubahan data',
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      createdAt: row.created_at,
    }))
  }

  const classes: StudyClass[] = (classesResult.data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    active: row.active,
  }))

  const jamaah: Jamaah[] = (jamaahResult.data ?? []).map((row: any) => ({
    id: row.id,
    fullName: row.full_name,
    gender: row.gender,
    birthDate: row.birth_date ?? '',
    phone: row.phone ?? '',
    censusCategory: row.census_category,
    active: row.active,
    classIds: (row.jamaah_classes ?? []).map((item: { class_id: string }) => item.class_id),
  }))

  const schedules: Schedule[] = (schedulesResult.data ?? []).map((row: any) => ({
    id: row.id,
    date: row.date,
    classId: row.class_id,
    materialType: row.material_type,
    materialName: row.material_name ?? '',
    notes: row.notes ?? '',
  }))

  const attendanceSessions: AttendanceSession[] = (sessionsResult.data ?? []).map((row: any) => ({
    id: row.id,
    date: row.date,
    classId: row.class_id,
    materialType: row.material_type,
    materialName: row.material_name ?? '',
    notes: row.notes ?? '',
    savedAt: row.saved_at,
    revision: row.revision ?? 1,
    statuses: Object.fromEntries(
      (row.attendance_records ?? []).map((item: { jamaah_id: string; status: AttendanceSession['statuses'][string] }) => [
        item.jamaah_id,
        item.status,
      ]),
    ),
  }))

  const materialCompletions: MaterialCompletion[] = (completionsResult.data ?? []).map((row: any) => ({
    id: row.id,
    month: row.month,
    materialType: row.material_type,
    jamaahId: row.jamaah_id,
    classId: row.class_id,
    source: row.source,
    completedOn: row.completed_on,
    sourceSessionId: row.source_session_id,
  }))

  const followUps: JamaahFollowUp[] = (followUpsResult.data ?? []).map((row: any) => ({
    id: row.id,
    jamaahId: row.jamaah_id,
    classId: row.class_id,
    periodMonth: row.period_month,
    status: row.status,
    triggerType: row.trigger_type,
    attendanceRate: row.attendance_rate ?? 0,
    absenceCount: row.absence_count ?? 0,
    consecutiveAbsence: row.consecutive_absence ?? 0,
    notes: row.notes ?? '',
    nextFollowUpDate: row.next_follow_up_date ?? '',
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))


  const reportingPeriods: ReportingPeriod[] = (periodsResult.data ?? []).map((row: any) => ({
    id: row.id,
    month: row.month,
    status: row.status,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  const classHistory: ClassMembershipHistory[] = (classHistoryResult.data ?? []).map((row: any) => ({
    id: row.id,
    jamaahId: row.jamaah_id,
    fromClassId: row.from_class_id,
    toClassId: row.to_class_id,
    previousCensusCategory: row.previous_census_category,
    newCensusCategory: row.new_census_category,
    effectiveDate: row.effective_date,
    changeType: row.change_type,
    notes: row.notes ?? '',
    changedBy: row.changed_by,
    createdAt: row.created_at,
  }))

  const statusHistory: JamaahStatusHistory[] = (statusHistoryResult.data ?? []).map((row: any) => ({
    id: row.id,
    jamaahId: row.jamaah_id,
    previousActive: row.previous_active,
    newActive: row.new_active,
    reason: row.reason,
    effectiveDate: row.effective_date,
    notes: row.notes ?? '',
    classIds: row.class_ids ?? [],
    changedBy: row.changed_by,
    createdAt: row.created_at,
  }))

  const families: Family[] = (familiesResult.data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    address: row.address ?? '',
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  const familyMembers: FamilyMember[] = (familyMembersResult.data ?? []).map((row: any) => ({
    familyId: row.family_id,
    jamaahId: row.jamaah_id,
    relationship: row.relationship,
    isPrimaryContact: row.is_primary_contact,
  }))

  const guardianContacts: GuardianContact[] = (guardianContactsResult.data ?? []).map((row: any) => ({
    id: row.id,
    jamaahId: row.jamaah_id,
    guardianJamaahId: row.guardian_jamaah_id ?? null,
    fullName: row.full_name,
    relationship: row.relationship,
    phone: row.phone ?? '',
    isPrimary: row.is_primary,
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  const mergeHistory: JamaahMergeHistory[] = (mergeHistoryResult.data ?? []).map((row: any) => ({
    id: row.id,
    primaryJamaahId: row.primary_jamaah_id,
    duplicateJamaahId: row.duplicate_jamaah_id,
    primaryName: row.primary_name,
    duplicateName: row.duplicate_name,
    mergedProfile: (row.merged_profile ?? {}) as Record<string, unknown>,
    duplicateSnapshot: (row.duplicate_snapshot ?? {}) as Record<string, unknown>,
    movedCounts: (row.moved_counts ?? {}) as Record<string, number>,
    familyConflict: row.family_conflict ?? false,
    mergedBy: row.merged_by,
    mergedAt: row.merged_at,
  }))

  return { classes, jamaah, schedules, attendanceSessions, materialCompletions, admins, auditLogs, followUps, reportingPeriods, classHistory, statusHistory, families, familyMembers, guardianContacts, mergeHistory }
}

export async function persistDemo(data: BootstrapData): Promise<void> {
  if (isDemoMode) saveDemoBootstrap(data)
}

export async function upsertJamaah(jamaah: Jamaah): Promise<Jamaah> {
  if (isDemoMode) return jamaah
  const client = requireSupabase()
  const { data, error } = await client.rpc('save_jamaah_record', {
    target_jamaah_id: jamaah.id.startsWith('new-') ? null : jamaah.id,
    jamaah_full_name: jamaah.fullName,
    jamaah_gender: jamaah.gender,
    jamaah_birth_date: jamaah.birthDate || null,
    jamaah_phone: jamaah.phone || null,
    jamaah_census_category: jamaah.censusCategory,
    jamaah_active: jamaah.active,
    jamaah_class_ids: jamaah.classIds,
  })
  if (error) throw error
  if (typeof data !== 'string') throw new Error('Data warga tersimpan, tetapi ID warga tidak diterima.')
  const id = data
  return { ...jamaah, id }
}

export async function importJamaahBatch(items: Jamaah[]): Promise<Jamaah[]> {
  if (isDemoMode) return items
  if (!items.length) return []
  const client = requireSupabase()
  const payload = items.map((item) => ({
    id: item.id,
    fullName: item.fullName,
    gender: item.gender,
    birthDate: item.birthDate,
    phone: item.phone || null,
    censusCategory: item.censusCategory,
    active: item.active,
    classIds: item.classIds,
  }))
  const { data, error } = await client.rpc('bulk_import_jamaah', { items: payload })
  if (error) throw error
  if (typeof data !== 'number') throw new Error('Import selesai, tetapi jumlah data tidak dapat diverifikasi.')
  return items
}

export async function upsertSchedule(schedule: Schedule): Promise<Schedule> {
  if (isDemoMode) return schedule
  const client = requireSupabase()
  const payload = {
    id: schedule.id.startsWith('new-') ? undefined : schedule.id,
    date: schedule.date,
    class_id: schedule.classId,
    material_type: schedule.materialType,
    material_name: schedule.materialName.trim() || '',
    notes: schedule.notes.trim() || null,
  }
  const { data, error } = await client.from('schedules').upsert(payload).select('id').single()
  if (error) throw error
  return { ...schedule, id: data.id as string }
}

export async function upsertAttendanceSession(
  session: AttendanceSession,
  expectedRevision: number,
  completionJamaahIds: string[],
): Promise<{ session: AttendanceSession; materialCompletions: MaterialCompletion[] }> {
  if (isDemoMode) {
    return {
      session: { ...session, revision: Math.max(expectedRevision, 0) + 1 },
      materialCompletions: completionJamaahIds.map((jamaahId) => ({
        id: crypto.randomUUID(),
        month: session.date.slice(0, 7),
        materialType: session.materialType as MaterialCompletion['materialType'],
        jamaahId,
        classId: session.classId,
        source: 'main_session',
        completedOn: session.date,
        sourceSessionId: session.id,
      })),
    }
  }
  const client = requireSupabase()
  const { data, error } = await client.rpc('save_attendance_session_complete', {
    target_session_id: session.id,
    session_date: session.date,
    target_class_id: session.classId,
    target_material_type: session.materialType,
    target_material_name: session.materialName.trim() || '',
    session_notes: session.notes.trim() || null,
    session_saved_at: session.savedAt,
    expected_revision: expectedRevision,
    record_items: Object.entries(session.statuses).map(([jamaahId, status]) => ({ jamaahId, status })),
    completion_jamaah_ids: completionJamaahIds,
  })
  if (error) {
    if (error.message.includes('ATTENDANCE_CONFLICT')) {
      throw new Error('Absensi ini sudah diperbarui oleh pengguna lain. Muat versi terbaru sebelum menyimpan kembali.')
    }
    throw error
  }
  const result = data as { id?: string; revision?: number; savedAt?: string; completions?: MaterialCompletion[] } | null
  if (!result?.id || typeof result.revision !== 'number') throw new Error('Absensi tersimpan, tetapi versi data tidak dapat diverifikasi.')
  return {
    session: { ...session, id: result.id, revision: result.revision, savedAt: result.savedAt ?? session.savedAt },
    materialCompletions: result.completions ?? [],
  }
}

export async function removeAttendanceSession(id: string): Promise<void> {
  if (isDemoMode) return
  const client = requireSupabase()
  const { error } = await client.from('attendance_sessions').delete().eq('id', id)
  if (error) throw error
}

export async function upsertMaterialCompletion(completion: MaterialCompletion): Promise<MaterialCompletion> {
  if (isDemoMode) return completion
  const client = requireSupabase()
  const payload = {
    month: completion.month,
    material_type: completion.materialType,
    jamaah_id: completion.jamaahId,
    class_id: completion.classId,
    source: completion.source,
    completed_on: completion.completedOn,
    source_session_id: completion.sourceSessionId,
  }
  const { data, error } = await client
    .from('material_completions')
    .upsert(payload, { onConflict: 'month,material_type,jamaah_id' })
    .select('id')
    .single()
  if (error) throw error
  return { ...completion, id: data.id as string }
}

export async function removeMaterialCompletion(id: string): Promise<void> {
  if (isDemoMode) return
  const client = requireSupabase()
  const { error } = await client.from('material_completions').delete().eq('id', id)
  if (error) throw error
}

export interface CreateAdminInput {
  fullName: string
  email: string
  password: string
  classIds: string[]
}

export async function createAdmin(input: CreateAdminInput): Promise<string> {
  if (isDemoMode) return `demo-admin-${Date.now()}`
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('invite-admin', { body: input })
  if (error) throw error
  if (data?.error) throw new Error(data.error as string)
  if (!data?.id) throw new Error('Akun Admin berhasil diproses, tetapi ID pengguna tidak diterima.')
  return data.id as string
}

export async function updateAdminAssignments(adminId: string, classIds: string[]): Promise<void> {
  if (isDemoMode) return
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('manage-admin', {
    body: { action: 'replace_assignments', adminId, classIds },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error as string)
}

export interface SetAdminActiveInput {
  adminId: string
  active: boolean
  replacementAdminId?: string | null
  classIds?: string[]
}

export async function setAdminActiveStatus(input: SetAdminActiveInput): Promise<void> {
  if (isDemoMode) return
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('manage-admin', {
    body: { action: 'set_active', ...input },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error as string)
}

export async function resetAdminPassword(adminId: string, temporaryPassword: string): Promise<void> {
  if (isDemoMode) return
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('manage-admin', {
    body: { action: 'reset_password', adminId, temporaryPassword },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error as string)
}

export async function transferAdminAssignments(sourceAdminId: string, targetAdminId: string, classIds: string[]): Promise<void> {
  if (isDemoMode) return
  const client = requireSupabase()
  const { data, error } = await client.functions.invoke('manage-admin', {
    body: { action: 'transfer_assignments', sourceAdminId, targetAdminId, classIds },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error as string)
}


export async function upsertJamaahFollowUp(followUp: JamaahFollowUp): Promise<JamaahFollowUp> {
  if (isDemoMode) return followUp
  const client = requireSupabase()
  const payload = {
    id: followUp.id.startsWith('new-') ? undefined : followUp.id,
    jamaah_id: followUp.jamaahId,
    class_id: followUp.classId,
    period_month: followUp.periodMonth,
    status: followUp.status,
    trigger_type: followUp.triggerType,
    attendance_rate: followUp.attendanceRate,
    absence_count: followUp.absenceCount,
    consecutive_absence: followUp.consecutiveAbsence,
    notes: followUp.notes || null,
    next_follow_up_date: followUp.nextFollowUpDate || null,
  }
  const { data, error } = await client
    .from('jamaah_follow_ups')
    .upsert(payload, { onConflict: 'jamaah_id,class_id,period_month' })
    .select('id,recorded_by,created_at,updated_at')
    .single()
  if (error) throw error
  return {
    ...followUp,
    id: data.id as string,
    recordedBy: data.recorded_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function removeJamaahFollowUp(id: string): Promise<void> {
  if (isDemoMode) return
  const client = requireSupabase()
  const { error } = await client.from('jamaah_follow_ups').delete().eq('id', id)
  if (error) throw error
}

export async function upsertReportingPeriod(input: {
  month: string
  status: ReportingPeriodStatus
  notes?: string
}): Promise<ReportingPeriod> {
  const now = new Date().toISOString()
  if (isDemoMode) {
    return {
      id: `period-${input.month}`,
      month: input.month,
      status: input.status,
      closedAt: input.status === 'closed' ? now : null,
      closedBy: null,
      notes: input.notes ?? '',
      createdAt: now,
      updatedAt: now,
    }
  }
  const client = requireSupabase()
  const payload = {
    month: input.month,
    status: input.status,
    notes: input.notes || null,
    closed_at: input.status === 'closed' ? now : null,
    closed_by: input.status === 'closed' ? (await client.auth.getUser()).data.user?.id ?? null : null,
  }
  const { data, error } = await client
    .from('reporting_periods')
    .upsert(payload, { onConflict: 'month' })
    .select('id,month,status,closed_at,closed_by,notes,created_at,updated_at')
    .single()
  if (error) throw error
  return {
    id: data.id as string,
    month: data.month,
    status: data.status,
    closedAt: data.closed_at,
    closedBy: data.closed_by,
    notes: data.notes ?? '',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}



export interface ClassTransitionInput {
  jamaahIds: string[]
  fromClassId: string
  toClassId: string
  effectiveDate: string
  changeType: ClassChangeType
  notes: string
  updateCensusCategory: boolean
}

export async function bulkTransitionJamaahClasses(input: ClassTransitionInput): Promise<number> {
  if (isDemoMode) return input.jamaahIds.length
  const client = requireSupabase()
  const { data, error } = await client.rpc('bulk_transition_jamaah_classes', {
    target_jamaah_ids: input.jamaahIds,
    source_class_id: input.fromClassId,
    destination_class_id: input.toClassId,
    transition_date: input.effectiveDate,
    transition_type: input.changeType,
    transition_notes: input.notes || null,
    update_census: input.updateCensusCategory,
  })
  if (error) throw error
  if (typeof data !== 'number') throw new Error('Perubahan kelas selesai, tetapi jumlah data tidak dapat diverifikasi.')
  return data
}

export interface JamaahStatusChangeInput {
  jamaahId: string
  active: boolean
  reason: JamaahStatusReason
  effectiveDate: string
  notes: string
  classIds: string[]
}

export async function changeJamaahStatus(input: JamaahStatusChangeInput): Promise<string> {
  if (isDemoMode) return crypto.randomUUID()
  const client = requireSupabase()
  const { data, error } = await client.rpc('change_jamaah_active_status', {
    target_jamaah_id: input.jamaahId,
    target_active: input.active,
    change_reason: input.reason,
    transition_date: input.effectiveDate,
    transition_notes: input.notes || null,
    restore_class_ids: input.classIds,
  })
  if (error) throw error
  if (typeof data !== 'string') throw new Error('Perubahan status selesai, tetapi ID riwayat tidak diterima.')
  return data
}



export interface SaveFamilyInput {
  family: Family
  members: FamilyMember[]
}

export async function upsertFamily(input: SaveFamilyInput): Promise<{ family: Family; members: FamilyMember[] }> {
  if (isDemoMode) return input
  const client = requireSupabase()
  const { data: familyId, error } = await client.rpc('save_family_record', {
    target_family_id: input.family.id.startsWith('new-') ? null : input.family.id,
    family_name: input.family.name.trim(),
    family_address: input.family.address.trim() || null,
    family_notes: input.family.notes.trim() || null,
    member_items: input.members.map((item) => ({
      jamaahId: item.jamaahId,
      relationship: item.relationship,
      isPrimaryContact: item.isPrimaryContact,
    })),
  })
  if (error) throw error
  if (typeof familyId !== 'string') throw new Error('Data keluarga tersimpan, tetapi ID keluarga tidak diterima.')
  const familyResult = await client.from('families').select('id,name,address,notes,created_at,updated_at').eq('id', familyId).single()
  if (familyResult.error) throw familyResult.error
  return {
    family: {
      id: familyResult.data.id as string,
      name: familyResult.data.name,
      address: familyResult.data.address ?? '',
      notes: familyResult.data.notes ?? '',
      createdAt: familyResult.data.created_at,
      updatedAt: familyResult.data.updated_at,
    },
    members: input.members.map((item) => ({ ...item, familyId })),
  }
}

export async function removeFamily(id: string): Promise<void> {
  if (isDemoMode) return
  const client = requireSupabase()
  const { error } = await client.from('families').delete().eq('id', id)
  if (error) throw error
}

export async function upsertGuardianContact(contact: GuardianContact): Promise<GuardianContact> {
  if (isDemoMode) return contact
  const client = requireSupabase()
  const { data: contactId, error } = await client.rpc('save_linked_guardian_contact', {
    target_contact_id: contact.id.startsWith('new-') ? null : contact.id,
    target_jamaah_id: contact.jamaahId,
    selected_guardian_jamaah_id: contact.guardianJamaahId,
    contact_relationship: contact.relationship,
    contact_is_primary: contact.isPrimary,
    contact_notes: contact.notes.trim() || null,
  })
  if (error) throw error
  if (typeof contactId !== 'string') throw new Error('Kontak wali tersimpan, tetapi ID kontak tidak diterima.')
  const result = await client
    .from('guardian_contacts')
    .select('id,jamaah_id,guardian_jamaah_id,full_name,relationship,phone,is_primary,notes,created_at,updated_at')
    .eq('id', contactId)
    .single()
  if (result.error) throw result.error
  return {
    id: result.data.id as string,
    jamaahId: result.data.jamaah_id,
    guardianJamaahId: result.data.guardian_jamaah_id,
    fullName: result.data.full_name,
    relationship: result.data.relationship,
    phone: result.data.phone ?? '',
    isPrimary: result.data.is_primary,
    notes: result.data.notes ?? '',
    createdAt: result.data.created_at,
    updatedAt: result.data.updated_at,
  }
}

export async function removeGuardianContact(id: string): Promise<void> {
  if (isDemoMode) return
  const client = requireSupabase()
  const { error } = await client.from('guardian_contacts').delete().eq('id', id)
  if (error) throw error
}


export interface MergeJamaahInput {
  primaryJamaahId: string
  duplicateJamaahId: string
  mergedProfile: Pick<Jamaah, 'fullName' | 'gender' | 'birthDate' | 'phone' | 'censusCategory' | 'active'>
}

export interface MergeJamaahResult {
  mergeId: string
  primaryJamaahId: string
  duplicateJamaahId: string
  familyConflict: boolean
}

export async function mergeJamaahDuplicates(input: MergeJamaahInput): Promise<MergeJamaahResult> {
  if (isDemoMode) {
    return {
      mergeId: crypto.randomUUID(),
      primaryJamaahId: input.primaryJamaahId,
      duplicateJamaahId: input.duplicateJamaahId,
      familyConflict: false,
    }
  }
  const client = requireSupabase()
  const { data, error } = await client.rpc('merge_jamaah_duplicates', {
    primary_id: input.primaryJamaahId,
    duplicate_id: input.duplicateJamaahId,
    merged_values: input.mergedProfile,
  })
  if (error) throw error
  const result = data as Record<string, unknown> | null
  if (!result?.mergeId || !result.primaryJamaahId || !result.duplicateJamaahId) {
    throw new Error('Penggabungan selesai, tetapi hasil transaksi tidak dapat diverifikasi.')
  }
  return {
    mergeId: String(result.mergeId),
    primaryJamaahId: String(result.primaryJamaahId),
    duplicateJamaahId: String(result.duplicateJamaahId),
    familyConflict: Boolean(result.familyConflict),
  }
}
