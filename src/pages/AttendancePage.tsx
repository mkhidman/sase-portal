import { CloudUpload, RefreshCw, Save, Search, ShieldAlert, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { InlineMessage, PageHeader, Person } from '../components/UI'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { feedbackError, feedbackFrom, feedbackInfo, feedbackOk, type Feedback } from '../lib/feedback'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { ATTENDANCE_LABELS, ATTENDANCE_OPTIONS, CENSUS_CATEGORIES, MATERIAL_LABELS } from '../lib/constants'
import { ageFromBirthDate, attendanceCounts, formatDateTime, isMandatoryMaterial, localIsoDate, materialDisplayName } from '../lib/utils'
import type { AttendanceSession, AttendanceStatus, Gender, MaterialType } from '../types/domain'
import { loadAttendanceDraft, removeAttendanceDraft, saveAttendanceDraft } from '../lib/offline'
import { isGeneralAttendanceBreakdownDay } from '../lib/generalAttendance'

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
  const [genderFilter, setGenderFilter] = useState<'all' | Gender>('all')
  const [search, setSearch] = useState('')
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<Feedback | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [conflictDetected, setConflictDetected] = useState(false)
  const online = useNetworkStatus()
  // Ditahan sampai pengguna menekan kirim: mengirim otomatis saat koneksi pulih membuat
  // expectedRevision basi dan berisiko menimpa absensi yang sudah diubah pengguna lain.
  const [pendingSinceOffline, setPendingSinceOffline] = useState(false)
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
  const generatedReadOnly = Boolean(existing?.generatedFromSessionId)
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
    setPendingSinceOffline(false)
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

  // Pesan sukses menutup sendiri: di HP kartu ini melayang di atas daftar nama, dan
  // konfirmasi yang menetap akan berbohong tentang apa yang baru saja terjadi.
  useEffect(() => {
    if (message?.tone !== 'success') return
    const timer = window.setTimeout(() => setMessage(null), 10000)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const genderMembers = members.filter((person) => genderFilter === 'all' || person.gender === genderFilter)
  const filteredMembers = genderMembers.filter((person) =>
    [person.fullName, person.censusCategory, person.gender].join(' ').toLowerCase().includes(search.trim().toLowerCase()),
  )
  const counts = attendanceCounts(statuses)
  const filteredCounts = attendanceCounts(Object.fromEntries(genderMembers.map((person) => [person.id, statuses[person.id] ?? 'absent'])))
  const serverCounts = attendanceCounts(existing?.statuses ?? {})

  function changeStatuses(next: Record<string, AttendanceStatus>) {
    setStatuses(next)
    setDirty(true)
    setMessage(null)
  }

  function setAll(status: AttendanceStatus) {
    const next = { ...statuses }
    genderMembers.forEach((person) => {
      next[person.id] = status
    })
    changeStatuses(next)
  }

  function loadServerVersion() {
    if (!existing) return
    if (user) removeAttendanceDraft(user.id, classId, date, materialType, materialName)
    hydrateFromLatest(existing, false)
    setMessage(feedbackInfo('Versi terbaru dari server sudah dimuat. Silakan periksa sebelum mengubah kembali.'))
  }

  async function submit() {
    if (!classId || !date) return
    if (generatedReadOnly) {
      setMessage(feedbackError('Rekap otomatis hanya dapat diubah melalui absensi Pengajian Umum.'))
      return
    }
    if (conflictDetected) {
      setMessage(feedbackError('Muat versi terbaru terlebih dahulu agar perubahan pengguna lain tidak tertimpa.'))
      return
    }
    if (!online && !isDemo) {
      persistDraftNow()
      setPendingSinceOffline(true)
      setMessage(feedbackInfo('Belum masuk server. Perubahan diamankan sebagai draft di perangkat ini — tekan Kirim sekarang begitu koneksi kembali.'))
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
      setPendingSinceOffline(false)
      if (isGeneral) {
        if (isGeneralAttendanceBreakdownDay(date)) {
          const generatedGroups = [
            ['Pra Remaja', 'Pra Remaja'],
            ['Remaja', 'Remaja'],
            ['Usia Nikah', 'Pra Nikah'],
          ]
            .map(([category, label]) => ({
              label,
              count: members.filter((person) => person.censusCategory === category && statuses[person.id]).length,
            }))
            .filter((item) => item.count > 0)
            .map((item) => `${item.label} ${item.count} peserta`)
            .join(', ')
          setMessage(feedbackOk(`Absensi Pengajian Umum berhasil disimpan sebagai versi ${saved.revision}.${generatedGroups ? ` Rekap status lengkap otomatis: ${generatedGroups}.` : ' Tidak ada peserta Pra Remaja, Remaja, atau Pra Nikah untuk dibuatkan rekap.'}`))
        } else {
          setMessage(feedbackOk(`Absensi Pengajian Umum berhasil disimpan sebagai versi ${saved.revision}. Rekap kelompok otomatis tidak dibuat karena tanggal ini bukan hari Senin atau Rabu.`))
        }
      } else {
        setMessage(feedbackOk(`Absensi berhasil disimpan sebagai versi ${saved.revision}.`))
      }
    } catch (cause) {
      const failure = feedbackFrom(cause, 'Gagal menyimpan absensi.')
      if (failure.text.includes('sudah diperbarui oleh pengguna lain')) setConflictDetected(true)
      setMessage(failure)
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
              disabled={periodClosed || futureDate || generatedReadOnly}
              onClick={() => changeStatuses({ ...statuses, [person.id]: status })}
              title={ATTENDANCE_LABELS[status]}
              aria-pressed={statuses[person.id] === status}
              aria-label={`${ATTENDANCE_LABELS[status]} — ${person.fullName}`}
            >
              <span aria-hidden="true">{ATTENDANCE_LABELS[status][0]}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const isGeneral = studyClass?.name === 'Pengajian Umum'
  const periodClosed = isPeriodClosed(date.slice(0, 7))
  const futureDate = date > localIsoDate()
  const offlineHold = !online && !isDemo
  const unsentAfterReconnect = online && pendingSinceOffline && dirty
  const saveBlocked = saving || periodClosed || futureDate || conflictDetected || generatedReadOnly
  const saveLabel = saving ? 'Menyimpan…' : offlineHold ? 'Simpan nanti · offline' : unsentAfterReconnect ? 'Kirim sekarang' : 'Simpan Absensi'

  return (
    <>
      <PageHeader
        title="Absensi Kelas"
        description="Status awal seluruh peserta adalah Alpa. Ubah hanya yang Hadir, Izin, atau Sakit."
        actions={<button className={`button ${offlineHold ? 'outline' : 'primary'}`} disabled={saveBlocked} onClick={() => void submit()}>{offlineHold ? <WifiOff size={16} /> : unsentAfterReconnect ? <CloudUpload size={16} /> : <Save size={16} />} {saveLabel}</button>}
      />

      <article className="card attendance-card">
        <div className="attendance-filters">
          <label>Kelas pengajian<select value={classId} disabled={generatedReadOnly} onChange={(event) => { persistDraftNow(); setClassId(event.target.value) }}>{visibleClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Tanggal<input type="date" max={localIsoDate()} value={date} disabled={generatedReadOnly} onChange={(event) => { persistDraftNow(); setDate(event.target.value) }} /></label>
          <label>Materi<select value={materialType} disabled={generatedReadOnly} onChange={(event) => { persistDraftNow(); setMaterialType(event.target.value as MaterialType); setMaterialName('') }}>{Object.entries(MATERIAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Jenis kelamin<select value={genderFilter} onChange={(event) => setGenderFilter(event.target.value as 'all' | Gender)}><option value="all">Semua warga</option><option value="Laki-laki">Laki-laki saja</option><option value="Perempuan">Perempuan saja</option></select></label>
          <label className="attendance-notes-field">Materi sambung / keterangan<textarea rows={3} value={notes} disabled={periodClosed || futureDate || generatedReadOnly} onChange={(event) => { setNotes(event.target.value); setDirty(true); setMessage(null) }} placeholder="Contoh: lanjut Bab 3 halaman 12, tugas pekan depan, atau catatan pengajian lainnya." /></label>
        </div>

        {materialName ? <div className="attendance-material-info"><strong>{materialName}</strong>{notes ? <span>{notes}</span> : null}</div> : notes ? <div className="attendance-material-info"><strong>{materialDisplayName(materialType, materialName)}</strong><span>{notes}</span></div> : null}

        {periodClosed ? <div className="notice danger-notice">Periode bulan ini sudah ditutup. Absensi hanya dapat dilihat dan tidak dapat diubah.</div> : null}
        {futureDate ? <div className="notice danger-notice">Jadwal ini belum berlangsung. Absensi dapat diisi mulai pada tanggal pelaksanaan.</div> : null}
        {generatedReadOnly ? <div className="notice info-notice">Ini adalah rekap otomatis peserta yang hadir di Pengajian Umum. Untuk mengoreksi data, edit sesi Pengajian Umum pada tanggal yang sama.</div> : null}

        {conflictDetected ? (
          <div className="notice attendance-conflict-notice">
            <ShieldAlert size={20} />
            <div><strong>Ada perubahan dari perangkat lain</strong><span>Versi server sekarang {existing?.revision ?? '-'} dengan {serverCounts.present} hadir, sedangkan draftmu memiliki {counts.present} hadir. Draft lokal tetap aman, tetapi tidak boleh langsung menimpa versi server.</span></div>
            <button className="button danger small" type="button" onClick={loadServerVersion}><RefreshCw size={14} /> Muat versi terbaru</button>
          </div>
        ) : null}

        {draftRestored ? <div className="notice info-notice">Draft absensi yang belum dikirim berhasil dipulihkan dari perangkat ini.</div> : null}

        {unsentAfterReconnect ? (
          <div className="notice attendance-unsent-notice">
            <CloudUpload size={20} />
            <div><strong>Koneksi sudah kembali</strong><span>Absensi ini masih tersimpan sebagai draft di perangkat dan belum masuk server.</span></div>
            <button className="button primary small" type="button" disabled={saveBlocked} onClick={() => void submit()}>Kirim sekarang</button>
          </div>
        ) : null}

        <div className={`notice ${isMandatoryMaterial(materialType) ? 'warning-notice' : ''}`}>
          {isMandatoryMaterial(materialType)
            ? `${materialDisplayName(materialType, materialName)} dipantau per bulan. Peserta yang hadir dan memenuhi kategori akan otomatis ditandai tuntas.`
            : 'Materi reguler hanya dicatat pada rekap sesi dan tidak masuk target Hasda/ASAD.'}
        </div>

        {isGeneral ? <div className="notice info-notice">Khusus Pengajian Umum hari Senin dan Rabu, seluruh status Hadir, Izin, Sakit, dan Alpa dari kategori Pra Remaja, Remaja, dan Usia Nikah otomatis disalin ke rekap kelas Pra Remaja, Remaja, dan Pra Nikah. Hari lain hanya tersimpan sebagai Pengajian Umum.</div> : null}

        <div className="attendance-toolbar">
          <div className="button-row"><button className="button soft small" disabled={periodClosed || futureDate || generatedReadOnly || !genderMembers.length} onClick={() => setAll('present')}>Semua {genderFilter === 'all' ? '' : genderFilter} Hadir</button><button className="button outline small" disabled={periodClosed || futureDate || generatedReadOnly || !genderMembers.length} onClick={() => setAll('absent')}>Reset ke Alpa</button></div>
          <div className="attendance-summary" aria-label="Keterangan tombol status dan jumlah peserta">
            {ATTENDANCE_OPTIONS.map((status) => (
              <span className={`attendance-summary-item ${status}`} key={status}>
                <b aria-hidden="true">{ATTENDANCE_LABELS[status][0]}</b>
                {ATTENDANCE_LABELS[status]}: {filteredCounts[status]}
              </span>
            ))}
          </div>
        </div>

        <label className="search-field attendance-search"><Search size={16} /><input placeholder="Cari nama peserta…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>

        {isGeneral ? (
          <div className="general-attendance-grid">
            {CENSUS_CATEGORIES.map((category) => {
              const group = filteredMembers.filter((person) => person.censusCategory === category)
              if (!group.length) return null
              return <section className="attendance-column" key={category}><header><strong>{category}</strong><span className="badge muted">{group.length}</span></header><div>{group.map((person) => attendanceItem(person.id))}</div></section>
            })}
          </div>
        ) : (
          <div className="attendance-list">{filteredMembers.length ? filteredMembers.map((person) => attendanceItem(person.id)) : <div className="empty-state">Tidak ada peserta yang sesuai filter.</div>}</div>
        )}

        <div className="draft-note">
          <span>{dirty ? 'Perubahan belum dikirim, tetapi sudah diamankan sebagai draft lokal.' : `Versi server ${existing?.revision ?? 0} sudah tersinkron.`}</span>
          {draftSavedAt ? <small>Draft terakhir {formatDateTime(draftSavedAt)}</small> : null}
        </div>
        <InlineMessage value={message} className="attendance-desktop-message" />
      </article>

      {/* Di HP hasil simpan dirender di sini, menempel pada tombolnya. Sebelumnya pesan
          muncul di dasar kartu — di luar layar ketika daftar peserta panjang. */}
      <div className="attendance-mobile-save">
        <InlineMessage value={message} className="attendance-mobile-message" />
        <div className="attendance-mobile-save-row">
          <span><strong>{counts.present} hadir</strong><small>{offlineHold ? 'Offline · draft lokal' : unsentAfterReconnect ? 'Belum masuk server' : dirty ? 'Draft tersimpan lokal' : `Versi ${existing?.revision ?? 0}`}</small></span>
          <button className={`button ${offlineHold ? 'outline' : 'primary'}`} disabled={saveBlocked} onClick={() => void submit()}>{offlineHold ? <WifiOff size={16} /> : unsentAfterReconnect ? <CloudUpload size={16} /> : <Save size={16} />} {saving ? 'Menyimpan…' : offlineHold ? 'Simpan nanti' : unsentAfterReconnect ? 'Kirim' : 'Simpan'}</button>
        </div>
      </div>
    </>
  )
}
