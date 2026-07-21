import { RefreshCw, Save, Search, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, Person } from '../components/UI'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { ATTENDANCE_LABELS, ATTENDANCE_OPTIONS, CENSUS_CATEGORIES, MATERIAL_LABELS } from '../lib/constants'
import { ageFromBirthDate, attendanceCounts, formatDateTime, isMandatoryMaterial, localIsoDate, materialDisplayName } from '../lib/utils'
import type { AttendanceSession, AttendanceStatus, MaterialType } from '../types/domain'
import { loadAttendanceDraft, removeAttendanceDraft, saveAttendanceDraft } from '../lib/offline'

export function AttendancePage() {
  const [params] = useSearchParams()
  const { user, isDemo } = useAuth()
  const { jamaah, visibleClasses, visibleJamaah, attendanceSessions, saveAttendance, isPeriodClosed } = useData()
  const initialClass = params.get('class') ?? visibleClasses[0]?.id ?? ''
  const initialDate = params.get('date') ?? localIsoDate()
  const initialMaterial = (params.get('material') as MaterialType | null) ?? 'general'
  const initialMaterialName = params.get('materialName') ?? ''
  const initialNotes = params.get('notes') ?? ''
  const sessionParam = params.get('session')

  const [classId, setClassId] = useState(initialClass)
  const [date, setDate] = useState(initialDate)
  const [materialType, setMaterialType] = useState<MaterialType>(initialMaterial)
  const [materialName, setMaterialName] = useState(initialMaterialName)
  const [notes, setNotes] = useState(initialNotes)
  const [search, setSearch] = useState('')
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [conflictDetected, setConflictDetected] = useState(false)
  const hydratedKey = useRef('')
  const baseRevision = useRef(0)
  const dirtyRef = useRef(false)

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    if (!classId && visibleClasses[0]) setClassId(visibleClasses[0].id)
  }, [classId, visibleClasses])

  const studyClass = visibleClasses.find((item) => item.id === classId)
  const sessionFromParam = sessionParam ? attendanceSessions.find((session) => session.id === sessionParam) : undefined
  const existing = sessionFromParam && sessionFromParam.classId === classId && sessionFromParam.date === date
    ? sessionFromParam
    : attendanceSessions.find(
      (session) => session.classId === classId && session.date === date && session.materialType === materialType && session.materialName === materialName,
    )
  const members = useMemo(() => {
    const byId = new Map(visibleJamaah.filter((person) => person.classIds.includes(classId)).map((person) => [person.id, person]))
    const historicalIds = new Set(Object.keys(existing?.statuses ?? {}))
    jamaah.forEach((person) => {
      if (historicalIds.has(person.id)) byId.set(person.id, person)
    })
    return [...byId.values()].sort((first, second) => first.fullName.localeCompare(second.fullName))
  }, [classId, existing?.id, existing?.revision, jamaah, visibleJamaah])
  const sessionKey = `${classId}|${date}|${materialType}|${materialName}`
  const memberKey = members.map((person) => person.id).sort().join('|')

  function serverStatuses(session?: AttendanceSession): Record<string, AttendanceStatus> {
    return Object.fromEntries(members.map((person) => [person.id, session?.statuses[person.id] ?? 'absent']))
  }

  function hydrateFromLatest(session?: AttendanceSession, restoreDraft = true) {
    const next = serverStatuses(session)
    const draft = restoreDraft && user ? loadAttendanceDraft(user.id, classId, date, materialType, materialName) : null
    const draftIsNewer = Boolean(draft && (!session || draft.updatedAt > session.savedAt))
    if (draftIsNewer && draft) {
      members.forEach((person) => {
        next[person.id] = draft.statuses[person.id] ?? next[person.id] ?? 'absent'
      })
      setNotes(draft.notes ?? session?.notes ?? notes)
      setDraftSavedAt(draft.updatedAt)
    } else if (session) {
      setNotes(session.notes)
      setDraftSavedAt(null)
    }
    setStatuses(next)
    baseRevision.current = session?.revision ?? 0
    setDraftRestored(draftIsNewer)
    setDirty(draftIsNewer)
    setConflictDetected(false)
    hydratedKey.current = sessionKey
  }

  useEffect(() => {
    hydratedKey.current = ''
    baseRevision.current = 0
    setDirty(false)
    setConflictDetected(false)
    hydrateFromLatest(existing, true)
    // sessionKey dan daftar anggota adalah identitas draft. existing sengaja ditangani pada effect terpisah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, memberKey, user?.id])

  useEffect(() => {
    if (hydratedKey.current !== sessionKey || !existing) return
    if (existing.revision <= baseRevision.current) return
    if (dirtyRef.current) {
      setConflictDetected(true)
      return
    }
    hydrateFromLatest(existing, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.revision, existing?.savedAt, sessionKey])

  useEffect(() => {
    if (!user || !classId || !date || !members.length || !dirty) return
    if (hydratedKey.current !== sessionKey) return
    const timer = window.setTimeout(() => {
      const updatedAt = new Date().toISOString()
      saveAttendanceDraft({
        userId: user.id,
        classId,
        date,
        materialType,
        materialName,
        notes,
        statuses,
        updatedAt,
      })
      setDraftSavedAt(updatedAt)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [classId, date, dirty, materialName, materialType, members.length, notes, sessionKey, statuses, user])

  function persistDraftNow() {
    if (!user || !classId || !date || !members.length || !dirtyRef.current) return
    const updatedAt = new Date().toISOString()
    saveAttendanceDraft({ userId: user.id, classId, date, materialType, materialName, notes, statuses, updatedAt })
    setDraftSavedAt(updatedAt)
  }

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') persistDraftNow()
    }
    const flushOnPageHide = () => persistDraftNow()
    document.addEventListener('visibilitychange', flushWhenHidden)
    window.addEventListener('pagehide', flushOnPageHide)
    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden)
      window.removeEventListener('pagehide', flushOnPageHide)
    }
  }, [classId, date, materialName, materialType, members.length, notes, statuses, user])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const filteredMembers = members.filter((person) =>
    [person.fullName, person.censusCategory].join(' ').toLowerCase().includes(search.trim().toLowerCase()),
  )
  const counts = attendanceCounts(statuses)
  const serverCounts = attendanceCounts(existing?.statuses ?? {})

  function changeStatuses(next: Record<string, AttendanceStatus>) {
    setStatuses(next)
    setDirty(true)
    setMessage(null)
  }

  function setAll(status: AttendanceStatus) {
    changeStatuses(Object.fromEntries(members.map((person) => [person.id, status])))
  }

  function loadServerVersion() {
    if (!existing) return
    if (user) removeAttendanceDraft(user.id, classId, date, materialType, materialName)
    hydrateFromLatest(existing, false)
    setMessage('Versi terbaru dari server sudah dimuat. Silakan periksa sebelum mengubah kembali.')
  }

  async function submit() {
    if (!classId || !date) return
    if (conflictDetected) {
      setMessage('Muat versi terbaru terlebih dahulu agar perubahan pengguna lain tidak tertimpa.')
      return
    }
    if (!navigator.onLine && !isDemo) {
      setMessage('Perangkat sedang offline. Perubahan tetap tersimpan sebagai draft dan dapat dikirim setelah koneksi kembali.')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const saved = await saveAttendance({
        id: existing?.id,
        classId,
        date,
        materialType,
        materialName,
        notes,
        statuses,
        expectedRevision: baseRevision.current,
      })
      baseRevision.current = saved.revision
      if (user) removeAttendanceDraft(user.id, classId, date, materialType, materialName)
      setDraftRestored(false)
      setDraftSavedAt(null)
      setDirty(false)
      setConflictDetected(false)
      setMessage(`Absensi berhasil disimpan sebagai versi ${saved.revision}.`)
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : 'Gagal menyimpan absensi.'
      if (text.includes('sudah diperbarui oleh pengguna lain')) setConflictDetected(true)
      setMessage(text)
    } finally {
      setSaving(false)
    }
  }

  function attendanceItem(personId: string) {
    const person = members.find((item) => item.id === personId)
    if (!person) return null
    return (
      <div className="attendance-person" key={person.id}>
        <Person name={person.fullName} meta={person.birthDate ? `${person.censusCategory} · ${ageFromBirthDate(person.birthDate)} tahun` : `${person.censusCategory} · Usia belum diisi`} />
        <div className="status-buttons">
          {ATTENDANCE_OPTIONS.map((status) => (
            <button
              type="button"
              key={status}
              className={`status-button ${status} ${statuses[person.id] === status ? 'active' : ''}`}
              disabled={periodClosed}
              onClick={() => changeStatuses({ ...statuses, [person.id]: status })}
              title={ATTENDANCE_LABELS[status]}
            >
              {ATTENDANCE_LABELS[status][0]}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const isGeneral = studyClass?.name === 'Pengajian Umum'
  const periodClosed = isPeriodClosed(date.slice(0, 7))

  return (
    <>
      <PageHeader
        title="Absensi Kelas"
        description="Status awal seluruh jamaah adalah Alpa. Ubah hanya yang Hadir, Izin, atau Sakit."
        actions={<button className="button primary" disabled={saving || periodClosed || conflictDetected} onClick={() => void submit()}><Save size={16} /> {saving ? 'Menyimpan…' : 'Simpan Absensi'}</button>}
      />

      <article className="card attendance-card">
        <div className="attendance-filters">
          <label>Kelas pengajian<select value={classId} onChange={(event) => { persistDraftNow(); setClassId(event.target.value) }}>{visibleClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Tanggal<input type="date" value={date} onChange={(event) => { persistDraftNow(); setDate(event.target.value) }} /></label>
          <label>Materi<select value={materialType} onChange={(event) => { persistDraftNow(); setMaterialType(event.target.value as MaterialType); setMaterialName('') }}>{Object.entries(MATERIAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>

        {materialName ? <div className="attendance-material-info"><strong>{materialName}</strong>{notes ? <span>{notes}</span> : null}</div> : notes ? <div className="attendance-material-info"><strong>{materialDisplayName(materialType, materialName)}</strong><span>{notes}</span></div> : null}

        {periodClosed ? <div className="notice danger-notice">Periode bulan ini sudah ditutup. Absensi hanya dapat dilihat dan tidak dapat diubah.</div> : null}

        {conflictDetected ? (
          <div className="notice attendance-conflict-notice">
            <ShieldAlert size={20} />
            <div><strong>Ada perubahan dari perangkat lain</strong><span>Versi server sekarang {existing?.revision ?? '-'} dengan {serverCounts.present} hadir, sedangkan draftmu memiliki {counts.present} hadir. Draft lokal tetap aman, tetapi tidak boleh langsung menimpa versi server.</span></div>
            <button className="button danger small" type="button" onClick={loadServerVersion}><RefreshCw size={14} /> Muat versi terbaru</button>
          </div>
        ) : null}

        {draftRestored ? <div className="notice info-notice">Draft absensi yang belum dikirim berhasil dipulihkan dari perangkat ini.</div> : null}

        <div className={`notice ${isMandatoryMaterial(materialType) ? 'warning-notice' : ''}`}>
          {isMandatoryMaterial(materialType)
            ? `${materialDisplayName(materialType, materialName)} dipantau per bulan. Jamaah yang hadir dan memenuhi kategori peserta akan otomatis ditandai tuntas.`
            : 'Materi reguler hanya dicatat pada rekap sesi dan tidak masuk target Hasda/ASAD.'}
        </div>

        <div className="attendance-toolbar">
          <div className="button-row"><button className="button soft small" disabled={periodClosed} onClick={() => setAll('present')}>Semua Hadir</button><button className="button outline small" disabled={periodClosed} onClick={() => setAll('absent')}>Reset ke Alpa</button></div>
          <div className="attendance-summary">{ATTENDANCE_OPTIONS.map((status) => <span key={status}>{ATTENDANCE_LABELS[status]}: {counts[status]}</span>)}</div>
        </div>

        <label className="search-field attendance-search"><Search size={16} /><input placeholder="Cari nama jamaah…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>

        {isGeneral ? (
          <div className="general-attendance-grid">
            {CENSUS_CATEGORIES.map((category) => {
              const group = filteredMembers.filter((person) => person.censusCategory === category)
              if (!group.length) return null
              return <section className="attendance-column" key={category}><header><strong>{category}</strong><span className="badge muted">{group.length}</span></header><div>{group.map((person) => attendanceItem(person.id))}</div></section>
            })}
          </div>
        ) : (
          <div className="attendance-list">{filteredMembers.length ? filteredMembers.map((person) => attendanceItem(person.id)) : <div className="empty-state">Belum ada jamaah pada kelas ini.</div>}</div>
        )}

        <div className="draft-note">
          <span>{dirty ? 'Perubahan belum dikirim, tetapi sudah diamankan sebagai draft lokal.' : `Versi server ${existing?.revision ?? 0} sudah tersinkron.`}</span>
          {draftSavedAt ? <small>Draft terakhir {formatDateTime(draftSavedAt)}</small> : null}
        </div>
        {message ? <div className={`inline-message ${message.includes('Gagal') || message.includes('terlebih dahulu') || message.includes('sudah diperbarui') ? 'error' : ''}`}>{message}</div> : null}
      </article>

      <div className="attendance-mobile-save">
        <span><strong>{counts.present} hadir</strong><small>{dirty ? 'Draft tersimpan lokal' : `Versi ${existing?.revision ?? 0}`}</small></span>
        <button className="button primary" disabled={saving || periodClosed || conflictDetected} onClick={() => void submit()}><Save size={16} /> {saving ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </>
  )
}
