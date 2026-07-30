import type { AttendanceStatus, BootstrapData, MaterialType } from '../types/domain'

const CACHE_PREFIX = 'sj-bootstrap-cache-v1'
const DRAFT_PREFIX = 'sj-attendance-draft-v2'
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000

export interface AttendanceDraft {
  userId: string
  classId: string
  date: string
  materialType: MaterialType
  materialName: string
  notes: string
  statuses: Record<string, AttendanceStatus>
  updatedAt: string
}

function safeParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function bootstrapCacheKey(userId: string): string {
  return `${CACHE_PREFIX}:${userId}`
}

export function saveBootstrapCache(userId: string, data: BootstrapData): void {
  try {
    localStorage.setItem(
      bootstrapCacheKey(userId),
      JSON.stringify({ data, cachedAt: new Date().toISOString() }),
    )
  } catch {
    // Cache is best effort. The main data flow must not fail if browser storage is full.
  }
}

export function loadBootstrapCache(userId: string): { data: BootstrapData; cachedAt: string } | null {
  const key = bootstrapCacheKey(userId)
  const cached = safeParse<{ data: BootstrapData; cachedAt: string }>(localStorage.getItem(key))
  if (!cached) return null
  const cachedAt = new Date(cached.cachedAt).getTime()
  if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > CACHE_MAX_AGE_MS) {
    localStorage.removeItem(key)
    return null
  }
  return {
    ...cached,
    data: {
      ...cached.data,
      attendanceSessions: (cached.data.attendanceSessions ?? []).map((session) => ({ ...session, revision: session.revision ?? 1, generatedFromSessionId: session.generatedFromSessionId ?? null })),
    },
  }
}

export function clearUserOfflineData(userId: string): void {
  localStorage.removeItem(bootstrapCacheKey(userId))
  const draftPrefix = `${DRAFT_PREFIX}:${userId}:`
  const keysToRemove: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(draftPrefix)) keysToRemove.push(key)
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key))
}

function normalizedMaterialKey(materialName: string): string {
  return encodeURIComponent(materialName.trim().toLowerCase() || 'default')
}

export function attendanceDraftKey(
  userId: string,
  classId: string,
  date: string,
  materialType: MaterialType,
  materialName = '',
): string {
  return `${DRAFT_PREFIX}:${userId}:${classId}:${date}:${materialType}:${normalizedMaterialKey(materialName)}`
}

export function saveAttendanceDraft(draft: AttendanceDraft): void {
  try {
    localStorage.setItem(
      attendanceDraftKey(draft.userId, draft.classId, draft.date, draft.materialType, draft.materialName),
      JSON.stringify(draft),
    )
  } catch {
    // Draft persistence is best effort.
  }
}

export function loadAttendanceDraft(
  userId: string,
  classId: string,
  date: string,
  materialType: MaterialType,
  materialName = '',
): AttendanceDraft | null {
  return safeParse<AttendanceDraft>(
    localStorage.getItem(attendanceDraftKey(userId, classId, date, materialType, materialName)),
  )
}

export function removeAttendanceDraft(
  userId: string,
  classId: string,
  date: string,
  materialType: MaterialType,
  materialName = '',
): void {
  localStorage.removeItem(attendanceDraftKey(userId, classId, date, materialType, materialName))
}
