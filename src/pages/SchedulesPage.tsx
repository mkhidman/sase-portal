import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Clock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { EmptyState, InlineMessage, PageHeader } from '../components/UI'
import { useConfirm } from '../components/useConfirm'
import { feedbackFrom, feedbackOk, type Feedback } from '../lib/feedback'
import { useData } from '../contexts/DataContext'
import { buildMonthGrid, formatTimeRange, isWeekend, shiftMonth, WEEKDAY_LABELS } from '../lib/calendar'
import { MATERIAL_LABELS } from '../lib/constants'
import { attendanceUrlForSchedule, buildMissedAttendance, MISSED_ATTENDANCE_MAX_AGE_DAYS } from '../lib/missedAttendance'
import { formatDate, isMandatoryMaterial, localIsoDate, materialDisplayName, monthLabel, monthValue } from '../lib/utils'
import type { MaterialType, Schedule } from '../types/domain'

const BUILTIN_MATERIALS: MaterialType[] = ['hasda', 'asad', 'general', 'evaluation']
const MISSED_VISIBLE_LIMIT = 10
const DOTS_VISIBLE_LIMIT = 3
const UPCOMING_HINT_LIMIT = 3

const emptyForm = (date: string, classId: string): Schedule => ({
  id: `new-${crypto.randomUUID()}`,
  date,
  startTime: '',
  endTime: '',
  classId,
  materialType: 'general',
  materialName: '',
  notes: '',
})

export function SchedulesPage() {
  const navigate = useNavigate()
  const { schedules, visibleClasses, attendanceSessions, saveSchedule, deleteSchedule, isPeriodClosed } = useData()
  const { confirm, dialog } = useConfirm()
  const today = localIsoDate()
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<Feedback | null>(null)
  const [materialChoice, setMaterialChoice] = useState<string>('general')
  const [editing, setEditing] = useState(false)
  const [month, setMonth] = useState(monthValue())
  const [selectedDate, setSelectedDate] = useState(today)
  const [form, setForm] = useState<Schedule>(() => emptyForm(today, ''))
  const allowedIds = useMemo(() => new Set(visibleClasses.map((item) => item.id)), [visibleClasses])
  const formPeriodClosed = isPeriodClosed(form.date.slice(0, 7))
  const classNameOf = (classId: string) => visibleClasses.find((item) => item.id === classId)?.name ?? 'Kelas'
  const missed = useMemo(
    () => buildMissedAttendance({ schedules, sessions: attendanceSessions, classIds: allowedIds }),
    [allowedIds, attendanceSessions, schedules],
  )
  const missedIds = useMemo(() => new Set(missed.map((item) => item.schedule.id)), [missed])
  const visibleSchedules = useMemo(
    () => schedules.filter((item) => allowedIds.has(item.classId)),
    [allowedIds, schedules],
  )
  // Satu pengelompokan untuk seluruh halaman: sel kalender, panel hari terpilih,
  // dan hitungan bulan membacanya dari peta yang sama.
  const byDate = useMemo(() => {
    const map = new Map<string, Schedule[]>()
    for (const schedule of visibleSchedules) {
      const list = map.get(schedule.date)
      if (list) list.push(schedule)
      else map.set(schedule.date, [schedule])
    }
    for (const list of map.values()) list.sort((a, b) => (a.startTime || '99').localeCompare(b.startTime || '99'))
    return map
  }, [visibleSchedules])
  const cells = useMemo(() => buildMonthGrid(month), [month])
  const monthCount = useMemo(
    () => visibleSchedules.filter((item) => item.date.slice(0, 7) === month).length,
    [month, visibleSchedules],
  )
  const selectedSchedules = byDate.get(selectedDate) ?? []
  const upcomingHint = useMemo(
    () => visibleSchedules.filter((item) => item.date > selectedDate).sort((a, b) => a.date.localeCompare(b.date)).slice(0, UPCOMING_HINT_LIMIT),
    [selectedDate, visibleSchedules],
  )
  const customMaterialNames = useMemo(
    () => [...new Set(schedules.map((item) => item.materialName.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')),
    [schedules],
  )

  function goToMonth(delta: number) {
    setMonth((current) => shiftMonth(current, delta))
  }

  function goToToday() {
    setMonth(monthValue())
    setSelectedDate(today)
  }

  function selectDate(date: string) {
    setSelectedDate(date)
    setMessage(null)
  }

  function openCreate(date = selectedDate) {
    setForm(emptyForm(date, visibleClasses[0]?.id ?? ''))
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
    const approved = await confirm({
      title: 'Batalkan jadwal ini?',
      description: `Jadwal ${classNameOf(schedule.classId)} pada ${formatDate(schedule.date)} akan dihapus dan tidak lagi muncul sebagai jadwal yang perlu diabsen. Absensi yang sudah tersimpan untuk tanggal tersebut tidak ikut terhapus.`,
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
    if (!editing && form.date < today) {
      setError('Jadwal baru tidak dapat menggunakan tanggal yang sudah lewat.')
      return
    }
    if (materialChoice === '__new__' && !form.materialName.trim()) {
      setError('Nama materi baru wajib diisi.')
      return
    }
    if (form.startTime && form.endTime && form.endTime <= form.startTime) {
      setError('Jam selesai harus lebih akhir dari jam mulai.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveSchedule({ ...form, materialName: form.materialName.trim(), notes: form.notes.trim() })
      setModalOpen(false)
      setMonth(form.date.slice(0, 7))
      setSelectedDate(form.date)
      setMessage(feedbackOk(editing ? 'Jadwal berhasil diperbarui.' : 'Jadwal berhasil ditambahkan.'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menyimpan jadwal.')
    } finally {
      setSaving(false)
    }
  }

  function scheduleRow(schedule: Schedule, late?: number) {
    const closed = isPeriodClosed(schedule.date.slice(0, 7))
    const timeRange = formatTimeRange(schedule.startTime, schedule.endTime)
    const name = classNameOf(schedule.classId)
    return (
      <div className={`schedule-row ${late === undefined ? '' : 'missed'}`} key={schedule.id}>
        <span className={`date-tile ${late === undefined ? '' : 'late'}`}><strong>{schedule.date.slice(8, 10)}</strong><small>{schedule.date.slice(5, 7)}</small></span>
        <span className="schedule-copy">
          <strong>{name}</strong>
          <small>{formatDate(schedule.date)} · {materialDisplayName(schedule.materialType, schedule.materialName)}</small>
          {timeRange ? <small className="schedule-time"><Clock size={12} /> {timeRange}</small> : null}
          {schedule.notes ? <em>{schedule.notes}</em> : null}
        </span>
        {late === undefined
          ? <span className={`badge ${isMandatoryMaterial(schedule.materialType) ? 'warning' : 'muted'}`}>{isMandatoryMaterial(schedule.materialType) ? 'Dipantau 100%' : 'Reguler'}</span>
          : <span className="badge danger">Terlambat {late} hari</span>}
        <div className="schedule-actions">
          <button className="button small primary" disabled={closed} title={closed ? 'Periode bulan ini sudah ditutup.' : undefined} onClick={() => navigate(attendanceUrlForSchedule(schedule))}>Isi Absensi</button>
          <button className="icon-button" type="button" disabled={closed} onClick={() => openEdit(schedule)} aria-label={`Ubah jadwal ${name} ${formatDate(schedule.date)}`} title="Ubah jadwal"><Pencil size={15} /></button>
          <button className="icon-button danger" type="button" disabled={closed} onClick={() => void cancelSchedule(schedule)} aria-label={`Batalkan jadwal ${name} ${formatDate(schedule.date)}`} title="Batalkan jadwal"><Trash2 size={15} /></button>
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Jadwal Pengajian" description="Kalender jadwal per bulan beserta jadwal lewat yang absensinya belum diisi. Admin hanya dapat menambahkan jadwal untuk kelas yang diampunya." actions={<button className="button primary" disabled={!visibleClasses.length} onClick={() => openCreate()}><CalendarPlus size={16} /> Tambah Jadwal</button>} />
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
            {missed.slice(0, MISSED_VISIBLE_LIMIT).map(({ schedule, daysLate }) => scheduleRow(schedule, daysLate))}
          </div>
          {missed.length > MISSED_VISIBLE_LIMIT ? (
            <p className="muted-copy missed-attendance-note">Menampilkan {MISSED_VISIBLE_LIMIT} jadwal terlewat terbaru dari {missed.length}. Daftar ini hanya mencakup {MISSED_ATTENDANCE_MAX_AGE_DAYS} hari terakhir.</p>
          ) : null}
        </article>
      ) : null}

      <div className="calendar-layout">
        <article className="card calendar-card">
          <div className="calendar-toolbar">
            <div>
              <h2>{monthLabel(month)}</h2>
              <p>{monthCount ? `${monthCount} jadwal bulan ini` : 'Belum ada jadwal bulan ini'}</p>
            </div>
            <div className="calendar-nav">
              <button className="icon-button" type="button" onClick={() => goToMonth(-1)} aria-label="Bulan sebelumnya" title="Bulan sebelumnya"><ChevronLeft size={16} /></button>
              <button className="button small outline" type="button" onClick={goToToday}>Hari ini</button>
              <button className="icon-button" type="button" onClick={() => goToMonth(1)} aria-label="Bulan berikutnya" title="Bulan berikutnya"><ChevronRight size={16} /></button>
            </div>
          </div>

          <div className="calendar-grid calendar-weekdays" aria-hidden="true">
            {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="calendar-grid">
            {cells.map((date, index) => {
              if (!date) return <span className="calendar-pad" key={`pad-${index}`} />
              const items = byDate.get(date) ?? []
              const classes = [
                'calendar-day',
                isWeekend(date) ? 'weekend' : '',
                date === today ? 'today' : '',
                date === selectedDate ? 'selected' : '',
              ].filter(Boolean).join(' ')
              return (
                <button className={classes} type="button" key={date} onClick={() => selectDate(date)} aria-pressed={date === selectedDate} aria-label={`${formatDate(date)}, ${items.length} jadwal`}>
                  <span className="calendar-day-number">{Number(date.slice(8, 10))}</span>
                  <span className="calendar-dots">
                    {items.slice(0, DOTS_VISIBLE_LIMIT).map((item) => (
                      <i key={item.id} className={`calendar-dot ${missedIds.has(item.id) ? 'late' : isMandatoryMaterial(item.materialType) ? 'mandatory' : 'regular'}`} />
                    ))}
                    {items.length > DOTS_VISIBLE_LIMIT ? <small>+{items.length - DOTS_VISIBLE_LIMIT}</small> : null}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="calendar-legend">
            <span><i className="calendar-dot mandatory" /> Dipantau 100%</span>
            <span><i className="calendar-dot regular" /> Reguler</span>
            <span><i className="calendar-dot late" /> Belum diabsen</span>
          </div>
        </article>

        <article className="card calendar-day-panel">
          <div className="card-heading">
            <div>
              <h2>{formatDate(selectedDate)}</h2>
              <p>{selectedSchedules.length ? `${selectedSchedules.length} jadwal` : 'Tidak ada jadwal pada tanggal ini'}</p>
            </div>
            <button className="icon-button" type="button" disabled={!visibleClasses.length} onClick={() => openCreate(selectedDate)} aria-label={`Tambah jadwal pada ${formatDate(selectedDate)}`} title="Tambah jadwal pada tanggal ini"><Plus size={16} /></button>
          </div>
          {selectedSchedules.length ? (
            <div className="schedule-list">{selectedSchedules.map((schedule) => scheduleRow(schedule))}</div>
          ) : (
            <>
              <EmptyState
                icon={<CalendarPlus size={20} />}
                title="Belum ada jadwal"
                description={visibleClasses.length ? 'Pilih tanggal lain pada kalender, atau tambahkan jadwal untuk tanggal ini.' : 'Belum ada kelas yang dapat Anda kelola.'}
                action={visibleClasses.length ? <button className="button primary" onClick={() => openCreate(selectedDate)}><CalendarPlus size={16} /> Tambah Jadwal</button> : undefined}
              />
              {/* Tanpa ini kalender hanya menampilkan satu bulan, sehingga jadwal
                  terdekat yang jatuh di bulan berikutnya tidak terlihat sama sekali. */}
              {upcomingHint.length ? (
                <div className="calendar-upcoming">
                  <strong>Jadwal terdekat berikutnya</strong>
                  {upcomingHint.map((schedule) => (
                    <button className="calendar-upcoming-item" type="button" key={schedule.id} onClick={() => { setMonth(schedule.date.slice(0, 7)); selectDate(schedule.date) }}>
                      <span>{formatDate(schedule.date)}</span>
                      <small>{classNameOf(schedule.classId)} · {materialDisplayName(schedule.materialType, schedule.materialName)}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </article>
      </div>

      <Modal open={modalOpen} title={editing ? 'Ubah Jadwal' : 'Tambah Jadwal'} onClose={() => setModalOpen(false)} footer={<><button className="button outline" onClick={() => setModalOpen(false)}>Batal</button><button className="button primary" disabled={saving || formPeriodClosed} onClick={() => void submit()}>{saving ? 'Menyimpan…' : 'Simpan Jadwal'}</button></>}>
        {formPeriodClosed ? <div className="notice danger-notice">Periode bulan ini sudah ditutup. Jadwal tidak dapat {editing ? 'diubah' : 'ditambahkan'}.</div> : null}
        <div className="form-grid one-column">
          <label>Tanggal<input type="date" min={editing ? undefined : today} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <div className="form-grid">
            <label>Jam mulai<input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label>
            <label>Jam selesai<input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label>
          </div>
          <p className="modal-help">Jam boleh dikosongkan. Jadwal lama yang dibuat sebelum kolom ini ada tetap tampil tanpa jam.</p>
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
