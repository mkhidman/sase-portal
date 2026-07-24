export type AppRole = 'superadmin' | 'admin'
export type Gender = 'Laki-laki' | 'Perempuan'
export type CensusCategory =
  | 'Balita'
  | 'Caberawit'
  | 'Pra Remaja'
  | 'Remaja'
  | 'Usia Nikah'
  | 'Menikah'
  | 'Duda & Janda'

export type MaterialType = 'hasda' | 'asad' | 'general' | 'evaluation'
export type AttendanceStatus = 'present' | 'excused' | 'sick' | 'absent'
export type CompletionSource = 'main_session' | 'follow_up'
export type AuditAction = 'insert' | 'update' | 'delete'
export type FollowUpStatus = 'pending' | 'contacted' | 'visit_needed' | 'resolved'
export type FollowUpTrigger = 'low_attendance' | 'consecutive_absence' | 'manual'
export type ReportingPeriodStatus = 'open' | 'closed'
export type ClassChangeType = 'promotion' | 'transfer' | 'manual'
export type JamaahStatusReason = 'moved' | 'stopped' | 'graduated' | 'deceased' | 'duplicate' | 'other' | 'reactivated'
export type FamilyRelationship = 'Kepala Keluarga' | 'Pasangan' | 'Anak' | 'Orang Tua' | 'Saudara' | 'Lainnya'
export type GuardianRelationship = 'Diri Sendiri' | 'Ayah' | 'Ibu' | 'Wali' | 'Suami' | 'Istri' | 'Anak' | 'Saudara' | 'Lainnya'

export interface AppUser {
  id: string
  name: string
  email: string
  role: AppRole
  assignedClassIds: string[]
  active: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
}

export interface StudyClass {
  id: string
  name: string
  active: boolean
}

export interface Jamaah {
  id: string
  fullName: string
  gender: Gender
  birthDate: string
  phone: string
  censusCategory: CensusCategory
  active: boolean
  classIds: string[]
}

export interface Schedule {
  id: string
  date: string
  classId: string
  materialType: MaterialType
  materialName: string
  notes: string
}

export interface AttendanceSession {
  id: string
  date: string
  classId: string
  materialType: MaterialType
  materialName: string
  notes: string
  statuses: Record<string, AttendanceStatus>
  savedAt: string
  revision: number
}

export interface MaterialCompletion {
  id: string
  month: string
  materialType: Extract<MaterialType, 'hasda' | 'asad'>
  jamaahId: string
  classId: string | null
  source: CompletionSource
  completedOn: string
  sourceSessionId: string | null
}


export interface JamaahFollowUp {
  id: string
  jamaahId: string
  classId: string
  periodMonth: string
  status: FollowUpStatus
  triggerType: FollowUpTrigger
  attendanceRate: number
  absenceCount: number
  consecutiveAbsence: number
  notes: string
  nextFollowUpDate: string
  recordedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface ReportingPeriod {
  id: string
  month: string
  status: ReportingPeriodStatus
  closedAt: string | null
  closedBy: string | null
  notes: string
  createdAt: string
  updatedAt: string
}


export interface ClassMembershipHistory {
  id: string
  jamaahId: string
  fromClassId: string | null
  toClassId: string | null
  previousCensusCategory: CensusCategory
  newCensusCategory: CensusCategory
  effectiveDate: string
  changeType: ClassChangeType
  notes: string
  changedBy: string | null
  createdAt: string
}


export interface JamaahStatusHistory {
  id: string
  jamaahId: string
  previousActive: boolean
  newActive: boolean
  reason: JamaahStatusReason
  effectiveDate: string
  notes: string
  classIds: string[]
  changedBy: string | null
  createdAt: string
}


export interface Family {
  id: string
  name: string
  address: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface FamilyMember {
  familyId: string
  jamaahId: string
  relationship: FamilyRelationship
  isPrimaryContact: boolean
}

export interface GuardianContact {
  id: string
  jamaahId: string
  guardianJamaahId: string | null
  fullName: string
  relationship: GuardianRelationship
  phone: string
  isPrimary: boolean
  notes: string
  createdAt: string
  updatedAt: string
}


export interface JamaahMergeHistory {
  id: string
  primaryJamaahId: string | null
  duplicateJamaahId: string
  primaryName: string
  duplicateName: string
  mergedProfile: Record<string, unknown>
  duplicateSnapshot: Record<string, unknown>
  movedCounts: Record<string, number>
  familyConflict: boolean
  mergedBy: string | null
  mergedAt: string
}

export interface AuditLog {
  id: string
  actorId: string | null
  actorName: string
  actorEmail: string
  action: AuditAction
  entityType: string
  entityId: string | null
  summary: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface BootstrapData {
  classes: StudyClass[]
  jamaah: Jamaah[]
  schedules: Schedule[]
  attendanceSessions: AttendanceSession[]
  materialCompletions: MaterialCompletion[]
  admins: AppUser[]
  auditLogs: AuditLog[]
  followUps: JamaahFollowUp[]
  reportingPeriods: ReportingPeriod[]
  classHistory: ClassMembershipHistory[]
  statusHistory: JamaahStatusHistory[]
  families: Family[]
  familyMembers: FamilyMember[]
  guardianContacts: GuardianContact[]
  mergeHistory: JamaahMergeHistory[]
}
