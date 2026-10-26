import type { AttendanceStatus, BootstrapData, MaterialType } from '../types/domain'

const CACHE_PREFIX = 'sj-bootstrap-cache-v1'
const DRAFT_PREFIX = 'sj-attendance-draft-v2'
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * 'quota' berarti penyimpanan perangkat penuh sehingga mode offline tidak lagi
 * punya data cadangan. Dulu kegagalan ini ditelan diam-diam, padahal pengguna baru
 * menyadarinya saat sudah di lokasi tanpa sinyal.
 */
export type OfflineCacheStatus = 'ok' | 'quota' | 'failed'

function isQuotaError(cause: unknown): boolean {
  if (!(cause instanceof DOMException)) return false
  return cause.name === 'QuotaExceededError' || cause.name === 'NS_ERROR_DOM_QUOTA_REACHED' || cause.code === 22
}

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

function bootstrapCacheKey(userId: string): string {
  return `${CACHE_PREFIX}:${userId}`
}

export function saveBootstrapCache(userId: string, data: BootstrapData): OfflineCacheStatus {
  // Tetap best effort: alur utama tidak boleh gagal karena penyimpanan penuh. Bedanya
  // sekarang kegagalan dilaporkan ke pemanggil supaya bisa diberitahukan ke pengguna.
  try {
    localStorage.setItem(
      bootstrapCacheKey(userId),
      JSON.stringify({ data, cachedAt: new Date().toISOString() }),
    )
    return 'ok'
  } catch (cause) {
    // Cache lama sengaja dibiarkan. setItem yang gagal tidak merusak nilai sebelumnya,
    // dan data basi masih lebih berguna daripada tidak ada data sama sekali saat offline.
    return isQuotaError(cause) ? 'quota' : 'failed'
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

function attendanceDraftKey(
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

/**
 * Draft yang dibuka lalu ditinggalkan tanpa disimpan tidak pernah terhapus sendiri.
 * Satu-satunya pembersih sebelumnya adalah tombol Keluar, padahal pada PWA pengguna
 * nyaris tidak pernah keluar. Dipanggil sekali saat data pertama dimuat.
 */
export function sweepStaleAttendanceDrafts(userId: string, maxAgeMs = DRAFT_MAX_AGE_MS): number {
  const prefix = `${DRAFT_PREFIX}:${userId}:`
  const now = Date.now()
  const keysToRemove: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith(prefix)) continue
    const draft = safeParse<AttendanceDraft>(localStorage.getItem(key))
    const updatedAt = draft ? new Date(draft.updatedAt).getTime() : Number.NaN
    // Draft tanpa tanggal yang terbaca sudah tidak dapat dipulihkan, jadi ikut dibuang.
    if (!Number.isFinite(updatedAt) || now - updatedAt > maxAgeMs) keysToRemove.push(key)
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key))
  return keysToRemove.length
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
