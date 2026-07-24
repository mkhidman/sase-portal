import type { BootstrapData, JamaahFollowUp, MaterialCompletion } from '../types/domain'
import type { MergeJamaahInput, MergeJamaahResult } from '../data/repository'

const ATTENDANCE_WEIGHT = { present: 4, sick: 3, excused: 2, absent: 1 } as const
const FOLLOW_UP_WEIGHT = { visit_needed: 4, pending: 3, contacted: 2, resolved: 1 } as const

function betterAttendance(first: keyof typeof ATTENDANCE_WEIGHT, second: keyof typeof ATTENDANCE_WEIGHT) {
  return ATTENDANCE_WEIGHT[first] >= ATTENDANCE_WEIGHT[second] ? first : second
}

function mergeCompletion(first: MaterialCompletion, second: MaterialCompletion): MaterialCompletion {
  if (first.source === 'follow_up' && second.source === 'main_session') {
    return { ...second, id: first.id, jamaahId: first.jamaahId, completedOn: first.completedOn < second.completedOn ? first.completedOn : second.completedOn }
  }
  return {
    ...first,
    classId: first.classId ?? second.classId,
    completedOn: first.completedOn < second.completedOn ? first.completedOn : second.completedOn,
  }
}

function mergeFollowUp(first: JamaahFollowUp, second: JamaahFollowUp): JamaahFollowUp {
  const status = FOLLOW_UP_WEIGHT[first.status] >= FOLLOW_UP_WEIGHT[second.status] ? first.status : second.status
  const notes = [first.notes, second.notes].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join('\n')
  return {
    ...first,
    status,
    attendanceRate: Math.min(first.attendanceRate, second.attendanceRate),
    absenceCount: Math.max(first.absenceCount, second.absenceCount),
    consecutiveAbsence: Math.max(first.consecutiveAbsence, second.consecutiveAbsence),
    notes,
    nextFollowUpDate: first.nextFollowUpDate || second.nextFollowUpDate,
    updatedAt: first.updatedAt > second.updatedAt ? first.updatedAt : second.updatedAt,
  }
}

export function mergeDemoJamaah(
  data: BootstrapData,
  input: MergeJamaahInput,
  result: MergeJamaahResult,
  actorId: string,
): BootstrapData {
  const primary = data.jamaah.find((item) => item.id === input.primaryJamaahId)
  const duplicate = data.jamaah.find((item) => item.id === input.duplicateJamaahId)
  if (!primary || !duplicate) throw new Error('Salah satu data warga tidak ditemukan.')

  const mergedClassIds = [...new Set([...primary.classIds, ...duplicate.classIds])]
  const mergedPrimary = { ...primary, ...input.mergedProfile, classIds: mergedClassIds }

  const attendanceSessions = data.attendanceSessions.map((session) => {
    const sourceStatus = session.statuses[duplicate.id]
    if (!sourceStatus) return session
    const statuses = { ...session.statuses }
    const targetStatus = statuses[primary.id]
    statuses[primary.id] = targetStatus ? betterAttendance(targetStatus, sourceStatus) : sourceStatus
    delete statuses[duplicate.id]
    return { ...session, statuses }
  })

  const completionMap = new Map<string, MaterialCompletion>()
  data.materialCompletions.forEach((completion) => {
    const normalized = completion.jamaahId === duplicate.id ? { ...completion, jamaahId: primary.id } : completion
    const key = `${normalized.month}|${normalized.materialType}|${normalized.jamaahId}`
    const existing = completionMap.get(key)
    completionMap.set(key, existing ? mergeCompletion(existing, normalized) : normalized)
  })

  const followUpMap = new Map<string, JamaahFollowUp>()
  data.followUps.forEach((followUp) => {
    const normalized = followUp.jamaahId === duplicate.id ? { ...followUp, jamaahId: primary.id } : followUp
    const key = `${normalized.jamaahId}|${normalized.classId}|${normalized.periodMonth}`
    const existing = followUpMap.get(key)
    followUpMap.set(key, existing ? mergeFollowUp(existing, normalized) : normalized)
  })

  const targetFamily = data.familyMembers.find((item) => item.jamaahId === primary.id)
  const sourceFamily = data.familyMembers.find((item) => item.jamaahId === duplicate.id)
  const familyConflict = Boolean(targetFamily && sourceFamily && targetFamily.familyId !== sourceFamily.familyId)
  let familyMembers = data.familyMembers.filter((item) => item.jamaahId !== duplicate.id)
  if (!targetFamily && sourceFamily) familyMembers = [...familyMembers, { ...sourceFamily, jamaahId: primary.id }]
  const usedFamilyIds = new Set(familyMembers.map((item) => item.familyId))
  const families = data.families.filter((family) => usedFamilyIds.has(family.id))

  const normalizedGuardianLinks = data.guardianContacts.map((item) => item.guardianJamaahId === duplicate.id
    ? { ...item, guardianJamaahId: primary.id, fullName: mergedPrimary.fullName, phone: mergedPrimary.phone }
    : item)
  const targetGuardians = normalizedGuardianLinks.filter((item) => item.jamaahId === primary.id)
  const targetGuardianKeys = new Set(targetGuardians.map((item) => item.guardianJamaahId
    ? `linked:${item.guardianJamaahId}`
    : `legacy:${item.fullName.trim().toLowerCase()}|${item.phone.replace(/\D/g, '')}`))
  const hasTargetPrimary = targetGuardians.some((item) => item.isPrimary)
  const movedGuardians = normalizedGuardianLinks
    .filter((item) => item.jamaahId === duplicate.id)
    .filter((item) => !targetGuardianKeys.has(item.guardianJamaahId
      ? `linked:${item.guardianJamaahId}`
      : `legacy:${item.fullName.trim().toLowerCase()}|${item.phone.replace(/\D/g, '')}`))
    .map((item) => ({ ...item, jamaahId: primary.id, isPrimary: hasTargetPrimary ? false : item.isPrimary }))
  const guardianContacts = [
    ...normalizedGuardianLinks.filter((item) => item.jamaahId !== duplicate.id),
    ...movedGuardians,
  ]

  const now = new Date().toISOString()
  const mergeHistory = {
    id: result.mergeId,
    primaryJamaahId: primary.id,
    duplicateJamaahId: duplicate.id,
    primaryName: primary.fullName,
    duplicateName: duplicate.fullName,
    mergedProfile: { ...input.mergedProfile },
    duplicateSnapshot: { ...duplicate },
    movedCounts: {
      classes: duplicate.classIds.length,
      attendance: data.attendanceSessions.filter((item) => duplicate.id in item.statuses).length,
      materials: data.materialCompletions.filter((item) => item.jamaahId === duplicate.id).length,
      followUps: data.followUps.filter((item) => item.jamaahId === duplicate.id).length,
      guardians: movedGuardians.length,
      classHistory: data.classHistory.filter((item) => item.jamaahId === duplicate.id).length,
      statusHistory: data.statusHistory.filter((item) => item.jamaahId === duplicate.id).length,
    },
    familyConflict,
    mergedBy: actorId,
    mergedAt: now,
  }

  return {
    ...data,
    jamaah: data.jamaah.filter((item) => item.id !== duplicate.id).map((item) => item.id === primary.id ? mergedPrimary : item),
    attendanceSessions,
    materialCompletions: [...completionMap.values()],
    followUps: [...followUpMap.values()],
    classHistory: data.classHistory.map((item) => item.jamaahId === duplicate.id ? { ...item, jamaahId: primary.id } : item),
    statusHistory: data.statusHistory.map((item) => item.jamaahId === duplicate.id ? { ...item, jamaahId: primary.id } : item),
    families,
    familyMembers,
    guardianContacts,
    mergeHistory: [mergeHistory, ...data.mergeHistory],
    auditLogs: [{
      id: crypto.randomUUID(),
      actorId,
      actorName: 'Superadmin Demo',
      actorEmail: '',
      action: 'update',
      entityType: 'jamaah_merge',
      entityId: result.mergeId,
      summary: `Menggabungkan data ${duplicate.fullName} ke ${input.mergedProfile.fullName}`,
      metadata: { primaryJamaahId: primary.id, duplicateJamaahId: duplicate.id, familyConflict },
      createdAt: now,
    }, ...data.auditLogs],
  }
}
