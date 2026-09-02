import { AlertTriangle, CalendarPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { EmptyState, InlineMessage, PageHeader } from '../components/UI'
import { useConfirm } from '../components/useConfirm'
import { feedbackFrom, feedbackOk, type Feedback } from '../lib/feedback'
import { useData } from '../contexts/DataContext'
import { MATERIAL_LABELS } from '../lib/constants'
import { attendanceUrlForSchedule, buildMissedAttendance, MISSED_ATTENDANCE_MAX_AGE_DAYS } from '../lib/missedAttendance'
import { formatDate, isMandatoryMaterial, localIsoDate, materialDisplayName } from '../lib/utils'
import type { MaterialType, Schedule } from '../types/domain'

const BUILTIN_MATERIALS: MaterialType[] = ['hasda', 'asad', 'general', 'evaluation']
const MISSED_VISIBLE_LIMIT = 10

export function SchedulesPage() {
  const navigate = useNavigate()
  const { schedules, visibleClasses, attendanceSessions, saveSchedule, deleteSchedule, isPeriodClosed } = useData()
  const { confirm, dialog } = useConfirm()
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<Feedback | null>(null)
  const [materialChoice, setMaterialChoice] = useState<string>('general')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Schedule>({ id: '', date: localIsoDate(), classId: '', materialType: 'general', materialName: '', notes: '' })
  const allowedIds = useMemo(() => new Set(visibleClasses.map((item) => item.id)), [visibleClasses])
  const formPeriodClosed = isPeriodClosed(form.date.slice(0, 7))
  const upcoming = schedules.filter((item) => allowedIds.has(item.classId) && item.date >= localIsoDate()).sort((a, b) => a.date.localeCompare(b.date))
  const missed = useMemo(
    () => buildMissedAttendance({ schedules, sessions: attendanceSessions, classIds: allowedIds }),
    [allowedIds, attendanceSessions, schedules],
  )
  const customMaterialNames = useMemo(
    () => [...new Set(schedules.map((item) => item.materialName.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')),
    [schedules],
  )

  function openCreate() {
    setForm({ id: `new-${crypto.randomUUID()}`, date: localIsoDate(), classId: visibleClasses[0]?.id ?? '', materialType: 'general', materialName: '', notes: '' })
    setMaterialChoice('general')
    setEditing(false)
    setError(null)
    setModalOpen(true)
  }

  function openEdit(schedule: Schedule) {
    setForm({ ...schedule })
    setMaterialChoice(schedule.materialName.trim() ? `custom:${schedule.materialName.trim()}` : schedule.materialType)
    setEditing(true)
    setError(null)
    setMessage(null)
    setModalOpen(true)
  }

  async function cancelSchedule(schedule: Schedule) {
    const studyClass = visibleClasses.find((item) => item.id === schedule.classId)
    const approved = await confirm({
      title: 'Batalkan jadwal ini?',
      description: `Jadwal ${studyClass?.name ?? 'kelas'} pada ${formatDate(schedule.date)} akan dihapus dan tidak lagi muncul sebagai jadwal yang perlu diabsen. Absensi yang sudah tersimpan untuk tanggal tersebut tidak ikut terhapus.`,
      confirmLabel: 'Batalkan Jadwal',
      tone: 'danger',
    })
    if (!approved) return
    setMessage(null)
    try {
      await deleteSchedule(schedule.id)
      setMessage(feedbackOk('Jadwal berhasil dibatalkan.'))
    } catch (cause) {
      setMessage(feedbackFrom(cause, 'Gagal membatalkan jadwal.'))
    }
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
    // Jadwal lama boleh diperbaiki di tempat; hanya jadwal baru yang dilarang mundur ke masa lalu.
    if (!editing && form.date < localIsoDate()) {
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
      setMessage(feedbackOk(editing ? 'Jadwal berhasil diperbarui.' : 'Jadwal berhasil ditambahkan.'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menyimpan jadwal.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Jadwal Pengajian" description="Jadwal mendatang beserta jadwal lewat yang absensinya belum diisi. Admin hanya dapat menambahkan jadwal untuk kelas yang diampunya." actions={<button className="button primary" disabled={!visibleClasses.length} onClick={openCreate}><CalendarPlus size={16} /> Tambah Jadwal</button>} />
      <div className="notice">Jadwal yang sudah diabsen dapat dilihat melalui halaman Rekap Keseluruhan.</div>
      <InlineMessage value={message} />

      {missed.length ? (
        <article className="card missed-attendance-card">
          <div className="card-heading">
            <div>
              <h2><AlertTriangle size={17} /> Belum diabsen</h2>
              <p>Jadwal ini sudah lewat tetapi absensinya belum pernah disimpan. Isi sekarang agar rekap dan laporan bulanan tidak bolong.</p>
            </div>
            <span className="badge danger">{missed.length} jadwal</span>
          </div>
          <div className="schedule-list">
            {missed.slice(0, MISSED_VISIBLE_LIMIT).map(({ schedule, daysLate }) => {
              const studyClass = visibleClasses.find((item) => item.id === schedule.classId)
              const closed = isPeriodClosed(schedule.date.slice(0, 7))
              return (
                <div className="schedule-row missed" key={schedule.id}>
                  <span className="date-tile late"><strong>{schedule.date.slice(8, 10)}</strong><small>{schedule.date.slice(5, 7)}</small></span>
                  <span className="schedule-copy">
                    <strong>{studyClass?.name ?? 'Kelas'}</strong>
                    <small>{formatDate(schedule.date)} · {materialDisplayName(schedule.materialType, schedule.materialName)}</small>
                    {schedule.notes ? <em>{schedule.notes}</em> : null}
                  </span>
                  <span className="badge danger">Terlambat {daysLate} hari</span>
                  <div className="schedule-actions">
                    <button className="button small primary" disabled={closed} title={closed ? 'Periode bulan ini sudah ditutup.' : undefined} onClick={() => navigate(attendanceUrlForSchedule(schedule))}>Isi Absensi</button>
                    <button className="icon-button" type="button" disabled={closed} onClick={() => openEdit(schedule)} aria-label={`Ubah jadwal ${studyClass?.name ?? 'kelas'} ${formatDate(schedule.date)}`} title="Ubah jadwal"><Pencil size={15} /></button>
                    <button className="icon-button danger" type="button" disabled={closed} onClick={() => void cancelSchedule(schedule)} aria-label={`Batalkan jadwal ${studyClass?.name ?? 'kelas'} ${formatDate(schedule.date)}`} title="Batalkan jadwal"><Trash2 size={15} /></button>
                  </div>
                </div>
              )
            })}
          </div>
          {missed.length > MISSED_VISIBLE_LIMIT ? (
            <p className="muted-copy missed-attendance-note">Menampilkan {MISSED_VISIBLE_LIMIT} jadwal terlewat terbaru dari {missed.length}. Daftar ini hanya mencakup {MISSED_ATTENDANCE_MAX_AGE_DAYS} hari terakhir.</p>
          ) : null}
        </article>
      ) : null}

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
                <div className="schedule-actions">
                  <button className="button small primary" disabled={isPeriodClosed(schedule.date.slice(0, 7))} onClick={() => navigate(attendanceUrlForSchedule(schedule))}>Isi Absensi</button>
                  <button className="icon-button" type="button" disabled={isPeriodClosed(schedule.date.slice(0, 7))} onClick={() => openEdit(schedule)} aria-label={`Ubah jadwal ${studyClass?.name ?? 'kelas'} ${formatDate(schedule.date)}`} title="Ubah jadwal"><Pencil size={15} /></button>
                  <button className="icon-button danger" type="button" disabled={isPeriodClosed(schedule.date.slice(0, 7))} onClick={() => void cancelSchedule(schedule)} aria-label={`Batalkan jadwal ${studyClass?.name ?? 'kelas'} ${formatDate(schedule.date)}`} title="Batalkan jadwal"><Trash2 size={15} /></button>
                </div>
              </div>
            )
          }) : <EmptyState icon={<CalendarPlus size={20} />} title="Belum ada jadwal mendatang" description={visibleClasses.length ? "Tambahkan jadwal agar absensi dapat diisi tepat pada hari pelaksanaan." : "Belum ada kelas yang dapat Anda kelola."} action={visibleClasses.length ? <button className="button primary" onClick={openCreate}><CalendarPlus size={16} /> Tambah Jadwal</button> : undefined} />}
        </div>
      </article>

      <Modal open={modalOpen} title={editing ? 'Ubah Jadwal' : 'Tambah Jadwal'} onClose={() => setModalOpen(false)} footer={<><button className="button outline" onClick={() => setModalOpen(false)}>Batal</button><button className="button primary" disabled={saving || formPeriodClosed} onClick={() => void submit()}>{saving ? 'Menyimpan…' : 'Simpan Jadwal'}</button></>}>
        {formPeriodClosed ? <div className="notice danger-notice">Periode bulan ini sudah ditutup. Jadwal tidak dapat {editing ? 'diubah' : 'ditambahkan'}.</div> : null}
        <div className="form-grid one-column">
          <label>Tanggal<input type="date" min={editing ? undefined : localIsoDate()} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
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

      {dialog}
    </>
  )
}
