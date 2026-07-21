import { useMemo, useState } from 'react'
import { PageHeader, Person, ProgressBlock } from '../components/UI'
import { useData } from '../contexts/DataContext'
import { MATERIAL_LABELS } from '../lib/constants'
import { formatDate, isEligibleForMaterial, monthValue, percentage } from '../lib/utils'

const HASDA_GROUPS = ['Semua Peserta', 'Pra Remaja', 'Remaja', 'Pra Nikah', 'Menikah', 'Duda & Janda']
const ASAD_GROUPS = ['Semua Peserta', 'Caberawit Kelas A', 'Caberawit Kelas B', 'Caberawit Kelas C', 'Pra Remaja', 'Remaja', 'Pra Nikah', 'Menikah', 'Duda & Janda']

export function MaterialsPage() {
  const { classes, visibleClasses, visibleJamaah, materialCompletions, toggleFollowUp, isPeriodClosed } = useData()
  const [month, setMonth] = useState(monthValue())
  const [materialType, setMaterialType] = useState<'hasda' | 'asad'>('hasda')
  const [group, setGroup] = useState('Semua Peserta')
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const classNameMap = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes])
  const visibleClassNames = useMemo(() => new Set(visibleClasses.map((item) => item.name)), [visibleClasses])
  const groups = (materialType === 'hasda' ? HASDA_GROUPS : ASAD_GROUPS).filter(
    (item) => item === 'Semua Peserta' || ['Menikah', 'Duda & Janda'].includes(item) || visibleClassNames.has(item),
  )
  const effectiveGroup = groups.includes(group) ? group : groups[0] ?? 'Semua Peserta'

  const participants = visibleJamaah.filter((person) => {
    if (!isEligibleForMaterial(materialType, person, classNameMap)) return false
    if (effectiveGroup === 'Semua Peserta') return true
    if (effectiveGroup === 'Menikah' || effectiveGroup === 'Duda & Janda') return person.censusCategory === effectiveGroup
    const classId = classes.find((item) => item.name === effectiveGroup)?.id
    return classId ? person.classIds.includes(classId) : false
  })

  const periodClosed = isPeriodClosed(month)

  const completed = participants.filter((person) =>
    materialCompletions.some(
      (item) => item.month === month && item.materialType === materialType && item.jamaahId === person.id,
    ),
  ).length

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
        </div>

        <ProgressBlock title={MATERIAL_LABELS[materialType]} percent={percentage(completed, participants.length)} done={completed} total={participants.length} />

        <div className="section-heading"><div><h2>{effectiveGroup} · {MATERIAL_LABELS[materialType]}</h2><p>Penyusulan mandiri tidak mengubah absensi sesi sebelumnya.</p></div></div>
        <div className="completion-list">
          {participants.map((person) => {
            const completion = materialCompletions.find((item) => item.month === month && item.materialType === materialType && item.jamaahId === person.id)
            return (
              <div className="completion-row" key={person.id}>
                <div><Person name={person.fullName} meta={`${person.gender} · ${person.censusCategory}`} /><div className="badge-list completion-meta"><span className={`badge ${completion ? 'success' : 'warning'}`}>{completion ? 'Sudah tuntas' : 'Belum tuntas'}</span>{completion ? <><span className="badge muted">{completion.source === 'main_session' ? 'Jadwal utama' : 'Penyusulan mandiri'}</span><span className="badge muted">{formatDate(completion.completedOn)}</span></> : null}</div></div>
                <button className={`button small ${completion ? 'outline' : 'primary'}`} disabled={workingId === person.id || periodClosed} onClick={() => void toggle(person.id)}>{completion ? 'Batalkan' : 'Tandai penyusulan selesai'}</button>
              </div>
            )
          })}
          {!participants.length ? <div className="empty-state">Tidak ada peserta pada kelompok ini.</div> : null}
        </div>
        {message ? <div className="inline-message error">{message}</div> : null}
      </article>
    </>
  )
}
