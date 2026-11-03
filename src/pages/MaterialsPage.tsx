import { Check, Copy, MessageCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { PageHeader, Person, ProgressBlock } from '../components/UI'
import { useData } from '../contexts/DataContext'
import { MATERIAL_LABELS } from '../lib/constants'
import { buildFollowUpMessage, pendingNames } from '../lib/followUpMessage'
import { formatDate, isEligibleForMaterial, jamaahSnapshotsAsOfDate, localIsoDate, monthEndDate, monthLabel, monthValue, percentage } from '../lib/utils'

const HASDA_GROUPS = ['Semua Peserta', 'Pra Remaja', 'Remaja', 'Pra Nikah', 'Menikah', 'Duda & Janda']
const ASAD_GROUPS = ['Semua Peserta', 'Caberawit Kelas A', 'Caberawit Kelas B', 'Caberawit Kelas C', 'Pra Remaja', 'Remaja', 'Pra Nikah', 'Menikah', 'Duda & Janda']
const SORT_OPTIONS = [
  { value: 'pending-first', label: 'Belum tuntas di atas' },
  { value: 'completed-first', label: 'Sudah tuntas di atas' },
  { value: 'name', label: 'Nama A–Z' },
] as const

type SortMode = (typeof SORT_OPTIONS)[number]['value']

export function MaterialsPage() {
  const { classNameMap, classes, visibleClasses, jamaah, classHistory, statusHistory, materialCompletions, toggleFollowUp, isPeriodClosed } = useData()
  const [month, setMonth] = useState(monthValue())
  const [materialType, setMaterialType] = useState<'hasda' | 'asad'>('hasda')
  const [group, setGroup] = useState('Semua Peserta')
  const [sortMode, setSortMode] = useState<SortMode>('pending-first')
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [draftOpen, setDraftOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [copyNote, setCopyNote] = useState<string | null>(null)

  const visibleClassNames = useMemo(() => new Set(visibleClasses.map((item) => item.name)), [visibleClasses])
  const groups = (materialType === 'hasda' ? HASDA_GROUPS : ASAD_GROUPS).filter(
    (item) => item === 'Semua Peserta' || ['Menikah', 'Duda & Janda'].includes(item) || visibleClassNames.has(item),
  )
  const effectiveGroup = groups.includes(group) ? group : groups[0] ?? 'Semua Peserta'
  const visibleClassIds = useMemo(() => new Set(visibleClasses.map((item) => item.id)), [visibleClasses])
  const snapshotJamaah = useMemo(
    () => jamaahSnapshotsAsOfDate(jamaah, classHistory, statusHistory, monthEndDate(month)),
    [classHistory, jamaah, month, statusHistory],
  )

  const participants = snapshotJamaah.filter((person) => {
    if (!person.active || !person.classIds.some((id) => visibleClassIds.has(id))) return false
    if (!isEligibleForMaterial(materialType, person, classNameMap)) return false
    if (effectiveGroup === 'Semua Peserta') return true
    if (effectiveGroup === 'Menikah' || effectiveGroup === 'Duda & Janda') return person.censusCategory === effectiveGroup
    const classId = classes.find((item) => item.name === effectiveGroup)?.id
    return classId ? person.classIds.includes(classId) : false
  })

  const periodClosed = isPeriodClosed(month)

  // Dikumpulkan sekali. Sebelumnya tiap pemanggilan memindai seluruh daftar ketuntasan,
  // dan pembanding pengurutan di bawah memanggilnya ratusan kali tiap layar digambar.
  const completedIds = useMemo(() => {
    const ids = new Set<string>()
    materialCompletions.forEach((item) => {
      if (item.month === month && item.materialType === materialType) ids.add(item.jamaahId)
    })
    return ids
  }, [materialCompletions, materialType, month])
  const isCompleted = (personId: string) => completedIds.has(personId)

  const sortedParticipants = [...participants].sort((left, right) => {
    if (sortMode !== 'name') {
      const rank = (personId: string) => (isCompleted(personId) ? 1 : 0)
      const difference = rank(left.id) - rank(right.id)
      if (difference !== 0) return sortMode === 'pending-first' ? difference : -difference
    }
    return left.fullName.localeCompare(right.fullName, 'id')
  })

  const completed = participants.filter((person) => isCompleted(person.id)).length
  const pending = participants.length - completed
  const genderProgress = (gender: 'Laki-laki' | 'Perempuan') => {
    const genderParticipants = participants.filter((person) => person.gender === gender)
    const done = genderParticipants.filter((person) => isCompleted(person.id)).length
    return { done, total: genderParticipants.length, percent: percentage(done, genderParticipants.length) }
  }
  const maleProgress = genderProgress('Laki-laki')
  const femaleProgress = genderProgress('Perempuan')

  async function toggle(personId: string) {
    const person = participants.find((item) => item.id === personId)
    if (!person) return
    const selectedClassId = classes.find((item) => item.name === effectiveGroup)?.id ?? person.classIds.find((id) => visibleClasses.some((studyClass) => studyClass.id === id)) ?? null
    setWorkingId(personId)
    setMessage(null)
    try {
      await toggleFollowUp(month, materialType, personId, selectedClassId)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Gagal memperbarui ketuntasan.')
    } finally {
      setWorkingId(null)
    }
  }

  // Teks dibuat sekali lalu boleh disunting di dalam modal, jadi yang disalin
  // selalu apa yang terlihat -- bukan hasil pembuatan ulang yang mengabaikan suntingan.
  function openDraft() {
    setDraft(buildFollowUpMessage({
      material: materialType === 'hasda' ? 'Hasda' : 'ASAD',
      monthLabel: monthLabel(month),
      groupLabel: effectiveGroup,
      names: pendingNames(participants, completedIds),
      generatedOn: formatDate(localIsoDate()),
    }))
    setCopyNote(null)
    setDraftOpen(true)
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft)
      setCopyNote('Pesan tersalin. Buka grup WhatsApp lalu tempel.')
    } catch {
      setCopyNote('Browser menolak menyalin otomatis. Pilih seluruh teks di atas lalu salin manual.')
    }
  }

  return (
    <>
      <PageHeader title="Ketuntasan Hasda & ASAD" description="Ketuntasan bulanan dipantau terpisah dari status kehadiran sesi." />
      {periodClosed ? <div className="notice danger-notice">Periode bulan ini sudah ditutup. Ketuntasan hanya dapat dilihat.</div> : null}
      <div className="notice"><strong>Hasda:</strong> Pra Remaja, Remaja, Pra Nikah, Menikah, Duda & Janda. <strong>ASAD:</strong> Caberawit Kelas A–C, Pra Remaja, Remaja, Pra Nikah, Menikah, Duda & Janda.</div>
      <article className="card">
        <div className="material-filters">
          <label>Bulan<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          <label>Materi<select value={materialType} onChange={(event) => { setMaterialType(event.target.value as 'hasda' | 'asad'); setGroup('Semua Peserta') }}><option value="hasda">Hasda</option><option value="asad">ASAD</option></select></label>
          <label>Kelompok peserta<select value={effectiveGroup} onChange={(event) => setGroup(event.target.value)}>{groups.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Urutkan daftar<select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>{SORT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>

        <ProgressBlock title={MATERIAL_LABELS[materialType]} percent={percentage(completed, participants.length)} done={completed} total={participants.length} />

        <section className="material-gender-summary" aria-label={`Ringkasan ${MATERIAL_LABELS[materialType]} per jenis kelamin`}>
          <div className="material-gender-summary-heading">
            <div>
              <strong>Ringkasan per Jenis Kelamin</strong>
              <small>Jumlah tuntas dibanding total peserta pada bulan dan kelompok yang dipilih.</small>
            </div>
          </div>
          <div className="material-gender-grid">
            <article className="material-gender-card">
              <span>Laki-laki</span>
              <strong>{maleProgress.done} dari {maleProgress.total}</strong>
              <small>{maleProgress.percent}% tuntas</small>
              <div className="progress-track compact"><span style={{ width: `${maleProgress.percent}%` }} /></div>
            </article>
            <article className="material-gender-card">
              <span>Perempuan</span>
              <strong>{femaleProgress.done} dari {femaleProgress.total}</strong>
              <small>{femaleProgress.percent}% tuntas</small>
              <div className="progress-track compact"><span style={{ width: `${femaleProgress.percent}%` }} /></div>
            </article>
            <article className="material-gender-card total">
              <span>Total Peserta</span>
              <strong>{completed} dari {participants.length}</strong>
              <small>{percentage(completed, participants.length)}% tuntas</small>
              <div className="progress-track compact"><span style={{ width: `${percentage(completed, participants.length)}%` }} /></div>
            </article>
          </div>
        </section>

        <div className="section-heading">
          <div>
            <h2>{effectiveGroup} · {MATERIAL_LABELS[materialType]}</h2>
            <p>Penyusulan mandiri tidak mengubah absensi sesi sebelumnya.</p>
          </div>
          <div className="completion-heading-actions">
            <div className="badge-list">
              <span className={`badge ${pending ? 'warning' : 'success'}`}>{pending} belum tuntas</span>
              <span className="badge muted">{completed} sudah tuntas</span>
            </div>
            <button
              className="button small outline"
              type="button"
              disabled={!pending}
              title={pending ? undefined : 'Semua peserta pada kelompok ini sudah tuntas.'}
              onClick={openDraft}
            >
              <MessageCircle size={15} /> Pesan WhatsApp
            </button>
          </div>
        </div>
        <div className="completion-list">
          {sortedParticipants.map((person) => {
            const completion = materialCompletions.find((item) => item.month === month && item.materialType === materialType && item.jamaahId === person.id)
            return (
              <div className="completion-row" key={person.id}>
                <div><Person name={person.fullName} meta={`${person.gender} · ${person.censusCategory}`} /><div className="badge-list completion-meta"><span className={`badge ${completion ? 'success' : 'warning'}`}>{completion ? 'Sudah tuntas' : 'Belum tuntas'}</span>{completion ? <><span className="badge muted">{completion.source === 'main_session' ? 'Jadwal utama' : 'Penyusulan mandiri'}</span><span className="badge muted">{formatDate(completion.completedOn)}</span></> : null}</div></div>
                <button
                  className={`button small ${completion ? 'outline' : 'primary'}`}
                  disabled={workingId === person.id || periodClosed || completion?.source === 'main_session'}
                  title={completion?.source === 'main_session' ? 'Ketuntasan ini mengikuti status hadir pada absensi sesi utama.' : undefined}
                  onClick={() => void toggle(person.id)}
                >
                  {completion?.source === 'main_session' ? 'Mengikuti absensi' : completion ? 'Batalkan' : 'Tandai penyusulan selesai'}
                </button>
              </div>
            )
          })}
          {!participants.length ? <div className="empty-state">Tidak ada peserta pada kelompok ini.</div> : null}
        </div>
        {message ? <div className="inline-message error">{message}</div> : null}
      </article>

      <Modal
        open={draftOpen}
        title="Pesan Follow Up WhatsApp"
        onClose={() => setDraftOpen(false)}
        footer={<><button className="button outline" type="button" onClick={() => setDraftOpen(false)}>Tutup</button><button className="button primary" type="button" onClick={() => void copyDraft()}><Copy size={15} /> Salin Pesan</button></>}
      >
        <p className="modal-help">Berisi {pendingNames(participants, completedIds).length} warga yang belum tuntas pada bulan, materi, dan kelompok yang sedang dipilih. Teksnya boleh disunting dulu sebelum disalin.</p>
        <div className="form-grid one-column">
          <label>Isi pesan<textarea rows={16} value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
        </div>
        {copyNote ? <p className="draft-copy-note"><Check size={14} /> {copyNote}</p> : null}
      </Modal>
    </>
  )
}
