import { CalendarPlus, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/UI'
import { useData } from '../contexts/DataContext'
import { MATERIAL_LABELS } from '../lib/constants'
import { formatDate, isMandatoryMaterial, localIsoDate, materialDisplayName } from '../lib/utils'
import type { MaterialType, Schedule } from '../types/domain'

const BUILTIN_MATERIALS: MaterialType[] = ['hasda', 'asad', 'general', 'evaluation']

function attendanceUrl(schedule: Schedule): string {
  const params = new URLSearchParams({
    class: schedule.classId,
    date: schedule.date,
    material: schedule.materialType,
  })
  if (schedule.materialName) params.set('materialName', schedule.materialName)
  if (schedule.notes) params.set('notes', schedule.notes)
  return `/absensi?${params.toString()}`
}

export function SchedulesPage() {
  const navigate = useNavigate()
  const { schedules, visibleClasses, saveSchedule, isPeriodClosed } = useData()
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [materialChoice, setMaterialChoice] = useState<string>('general')
  const [form, setForm] = useState<Schedule>({ id: '', date: localIsoDate(), classId: '', materialType: 'general', materialName: '', notes: '' })
  const allowedIds = useMemo(() => new Set(visibleClasses.map((item) => item.id)), [visibleClasses])
  const formPeriodClosed = isPeriodClosed(form.date.slice(0, 7))
  const upcoming = schedules.filter((item) => allowedIds.has(item.classId) && item.date >= localIsoDate()).sort((a, b) => a.date.localeCompare(b.date))
  const customMaterialNames = useMemo(
    () => [...new Set(schedules.map((item) => item.materialName.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')),
    [schedules],
  )

  function openCreate() {
    setForm({ id: `new-${crypto.randomUUID()}`, date: localIsoDate(), classId: visibleClasses[0]?.id ?? '', materialType: 'general', materialName: '', notes: '' })
    setMaterialChoice('general')
    setError(null)
    setModalOpen(true)
  }

  function changeMaterialChoice(value: string) {
    setMaterialChoice(value)
    if (BUILTIN_MATERIALS.includes(value as MaterialType)) {
      setForm((current) => ({ ...current, materialType: value as MaterialType, materialName: '' }))
      return
    }
    if (value.startsWith('custom:')) {
      setForm((current) => ({ ...current, materialType: 'general', materialName: value.slice(7) }))
      return
    }
    setForm((current) => ({ ...current, materialType: 'general', materialName: '' }))
  }

  async function submit() {
    if (!form.date || !form.classId) return
    if (form.date < localIsoDate()) {
      setError('Jadwal baru tidak dapat menggunakan tanggal yang sudah lewat.')
      return
    }
    if (materialChoice === '__new__' && !form.materialName.trim()) {
      setError('Nama materi baru wajib diisi.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveSchedule({ ...form, materialName: form.materialName.trim(), notes: form.notes.trim() })
      setModalOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menyimpan jadwal.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Jadwal Pengajian" description="Admin dapat menambahkan jadwal hanya untuk kelas yang diampunya. Hanya jadwal hari ini dan setelahnya yang ditampilkan." actions={<button className="button primary" disabled={!visibleClasses.length} onClick={openCreate}><CalendarPlus size={16} /> Tambah Jadwal</button>} />
      <div className="notice">Tanggal yang sudah lewat tetap tersimpan dan dapat dilihat melalui halaman Rekap Keseluruhan.</div>
      <article className="card">
        <div className="schedule-list">
          {upcoming.length ? upcoming.map((schedule) => {
            const studyClass = visibleClasses.find((item) => item.id === schedule.classId)
            return (
              <div className="schedule-row" key={schedule.id}>
                <span className="date-tile"><strong>{schedule.date.slice(8, 10)}</strong><small>{schedule.date.slice(5, 7)}</small></span>
                <span className="schedule-copy">
                  <strong>{studyClass?.name ?? 'Kelas'}</strong>
                  <small>{formatDate(schedule.date)} · {materialDisplayName(schedule.materialType, schedule.materialName)}</small>
                  {schedule.notes ? <em>{schedule.notes}</em> : null}
                </span>
                <span className={`badge ${isMandatoryMaterial(schedule.materialType) ? 'warning' : 'muted'}`}>{isMandatoryMaterial(schedule.materialType) ? 'Dipantau 100%' : 'Reguler'}</span>
                <button className="button small primary" disabled={isPeriodClosed(schedule.date.slice(0, 7))} onClick={() => navigate(attendanceUrl(schedule))}>Isi Absensi</button>
              </div>
            )
          }) : <div className="empty-state">Belum ada jadwal mendatang.</div>}
        </div>
      </article>

      <Modal open={modalOpen} title="Tambah Jadwal" onClose={() => setModalOpen(false)} footer={<><button className="button outline" onClick={() => setModalOpen(false)}>Batal</button><button className="button primary" disabled={saving || formPeriodClosed} onClick={() => void submit()}>{saving ? 'Menyimpan…' : 'Simpan Jadwal'}</button></>}>
        {formPeriodClosed ? <div className="notice danger-notice">Periode bulan ini sudah ditutup. Jadwal tidak dapat ditambahkan.</div> : null}
        <div className="form-grid one-column">
          <label>Tanggal<input type="date" min={localIsoDate()} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <label>Kelas<select value={form.classId} onChange={(event) => setForm({ ...form, classId: event.target.value })}>{visibleClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Materi
            <select value={materialChoice} onChange={(event) => changeMaterialChoice(event.target.value)}>
              {BUILTIN_MATERIALS.map((value) => <option key={value} value={value}>{MATERIAL_LABELS[value]}</option>)}
              {customMaterialNames.length ? <optgroup label="Materi yang pernah ditambahkan">{customMaterialNames.map((name) => <option key={name} value={`custom:${name}`}>{name}</option>)}</optgroup> : null}
              <option value="__new__">+ Tambah materi baru</option>
            </select>
          </label>
          {materialChoice === '__new__' ? <label>Nama materi baru<div className="input-with-icon"><Plus size={15} /><input autoFocus value={form.materialName} onChange={(event) => setForm({ ...form, materialName: event.target.value })} placeholder="Contoh: Tafsir Surat Al-Mulk" /></div></label> : null}
          <label>Keterangan<textarea rows={4} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Contoh: Bab 1-3, membawa buku catatan, atau informasi tambahan lainnya." /></label>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </Modal>
    </>
  )
}
