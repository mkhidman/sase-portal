import { Archive, ArrowDownNarrowWide, ArrowUpNarrowWide, Eye, FileText, GitMerge, Layers, Mars, Plus, Search, UsersRound, Venus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { GenderComposition } from '../components/GenderComposition'
import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { PageHeader, Person, StatCard } from '../components/UI'
import { DateField } from '../components/DateField'
import { useData } from '../contexts/DataContext'
import { usePagination } from '../hooks/usePagination'
import { ATTENDANCE_LABELS, ATTENDANCE_OPTIONS, CENSUS_CATEGORIES } from '../lib/constants'
import { buildCensusPdfGroups, downloadCensusPdf } from '../lib/censusPdf'
import { ageFromBirthDate, attendanceCounts, formatDate, localIsoDate, materialDisplayName, monthLabel, monthValue, percentage } from '../lib/utils'
import type { AttendanceStatus, CensusCategory, Gender, Jamaah } from '../types/domain'

const EMPTY_FORM: Jamaah = {
  id: '',
  fullName: '',
  gender: 'Laki-laki',
  birthDate: '',
  phone: '',
  censusCategory: 'Caberawit',
  active: true,
  classIds: [],
}

export function CensusPage() {
  const { jamaah, classes, classNameMap, attendanceSessions, saveJamaah } = useData()
  const [params] = useSearchParams()
  const handledEditId = useRef('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CensusCategory | ''>('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [form, setForm] = useState<Jamaah>(EMPTY_FORM)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pageMessage, setPageMessage] = useState<string | null>(null)
  const [attendancePerson, setAttendancePerson] = useState<Jamaah | null>(null)
  const [detailMonth, setDetailMonth] = useState('')
  const [detailClassId, setDetailClassId] = useState('')
  const [detailStatus, setDetailStatus] = useState<AttendanceStatus | ''>('')
  const [detailOldestFirst, setDetailOldestFirst] = useState(false)


  const active = jamaah.filter((item) => item.active)
  const censusGenderSummary = useMemo(() => CENSUS_CATEGORIES.map((categoryName) => {
    const members = jamaah.filter((item) => item.active && item.censusCategory === categoryName)
    const male = members.filter((item) => item.gender === 'Laki-laki').length
    const female = members.filter((item) => item.gender === 'Perempuan').length
    return { categoryName, male, female, total: members.length }
  }), [jamaah])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return active.filter((item) => {
      const text = [item.fullName, item.phone, item.censusCategory].join(' ').toLowerCase()
      return (!query || text.includes(query)) && (!category || item.censusCategory === category) && (!gender || item.gender === gender)
    })
  }, [active, category, gender, search])

  const pagination = usePagination(filtered, `${search}|${category}|${gender}`)

  const personAttendance = useMemo(() => {
    if (!attendancePerson) return []
    return attendanceSessions
      .flatMap((session) => {
        const status = session.statuses[attendancePerson.id]
        return status ? [{ session, status }] : []
      })
      .sort((first, second) => (
        second.session.date.localeCompare(first.session.date)
        || second.session.savedAt.localeCompare(first.session.savedAt)
      ))
  }, [attendancePerson, attendanceSessions])
  const personMonths = useMemo(() => [...new Set(personAttendance.map((item) => item.session.date.slice(0, 7)))], [personAttendance])
  const personClassIds = useMemo(() => [...new Set(personAttendance.map((item) => item.session.classId))], [personAttendance])
  const detailFiltered = Boolean(detailMonth || detailClassId || detailStatus)
  // personAttendance sudah urut terbaru dulu, jadi urutan terlama cukup dibalik.
  const visiblePersonAttendance = useMemo(() => {
    const rows = personAttendance.filter(({ session, status }) => (
      (!detailMonth || session.date.startsWith(detailMonth))
      && (!detailClassId || session.classId === detailClassId)
      && (!detailStatus || status === detailStatus)
    ))
    return detailOldestFirst ? rows.reverse() : rows
  }, [detailClassId, detailMonth, detailOldestFirst, detailStatus, personAttendance])
  const personAttendanceCounts = attendanceCounts(Object.fromEntries(
    visiblePersonAttendance.map((item, index) => [String(index), item.status]),
  ))
  const personAttendanceRate = percentage(personAttendanceCounts.present, visiblePersonAttendance.length)

  // Filter milik warga sebelumnya tidak boleh ikut terbawa: bulan atau kelasnya
  // belum tentu ada pada warga berikutnya, dan tabelnya akan tampak kosong.
  useEffect(() => {
    setDetailMonth('')
    setDetailClassId('')
    setDetailStatus('')
    setDetailOldestFirst(false)
  }, [attendancePerson])

  useEffect(() => {
    const editId = params.get('edit') ?? ''
    if (!editId || handledEditId.current === editId) return
    const person = jamaah.find((item) => item.id === editId)
    if (!person) return
    handledEditId.current = editId
    openEdit(person)
  }, [jamaah, params])

  function openCreate() {
    setForm({ ...EMPTY_FORM, id: `new-${crypto.randomUUID()}` })
    setMessage(null)
    setModalOpen(true)
  }

  function openEdit(item: Jamaah) {
    setForm({ ...item, classIds: [...item.classIds] })
    setMessage(null)
    setModalOpen(true)
  }

  async function submit() {
    if (!form.fullName.trim()) {
      setMessage('Nama lengkap wajib diisi.')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      await saveJamaah({ ...form, fullName: form.fullName.trim(), phone: form.phone.trim() })
      setModalOpen(false)
      setPageMessage('Data warga berhasil disimpan.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Gagal menyimpan warga.')
    } finally {
      setSaving(false)
    }
  }

  function exportCensusPdf() {
    const month = monthValue()
    downloadCensusPdf({
      title: 'DAFTAR SENSUS KELOMPOK SADANG SERANG',
      periodLabel: `PERIODE BULAN ${monthLabel(month).toUpperCase()}`,
      groups: buildCensusPdfGroups(jamaah, CENSUS_CATEGORIES),
    }, `daftar-warga-${month}.pdf`)
  }

  return (
    <>
      <PageHeader
        title="Data Sensus Warga"
        actions={
          <>
            <Link className="button outline" to="/arsip-jamaah"><Archive size={16} /> Status & Arsip</Link>
            <button className="button outline" onClick={exportCensusPdf}><FileText size={16} /> Ekspor PDF</button>
            <Link className="button outline" to="/data-duplikat"><GitMerge size={16} /> Data Duplikat</Link>
            <button className="button primary" onClick={openCreate}><Plus size={16} /> Tambah Warga</button>
          </>
        }
      />

      {pageMessage ? <div className="inline-message page-message">{pageMessage}</div> : null}

      <section className="stats-grid four-columns compact-stats">
        <StatCard tone="mint" label="Total Aktif" value={active.length} icon={<UsersRound size={20} />} />
        <StatCard tone="sky" label="Laki-laki" value={active.filter((item) => item.gender === 'Laki-laki').length} icon={<Mars size={20} />} />
        <StatCard tone="violet" label="Perempuan" value={active.filter((item) => item.gender === 'Perempuan').length} icon={<Venus size={20} />} />
        <StatCard tone="mint" label="Kategori Sensus" value={CENSUS_CATEGORIES.length} icon={<Layers size={20} />} />
      </section>

      <article className="card census-composition-card">
        <div className="card-heading">
          <div>
            <h2>Ringkasan Kategori Sensus</h2>
          </div>
        </div>
        <GenderComposition rows={censusGenderSummary.map((item) => ({ key: item.categoryName, label: item.categoryName, male: item.male, female: item.female, total: item.total }))} />
      </article>

      <article className="card">
        <div className="toolbar">
          <label className="search-field"><Search size={16} /><input placeholder="Cari nama atau nomor WhatsApp…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <select value={category} onChange={(event) => setCategory(event.target.value as CensusCategory | '')}><option value="">Semua kategori</option>{CENSUS_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={gender} onChange={(event) => setGender(event.target.value as Gender | '')}><option value="">Semua gender</option><option>Laki-laki</option><option>Perempuan</option></select>
        </div>
        <div className="table-wrap census-table">
          <table role="table">
            <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Warga</th><th scope="col" role="columnheader">Aksi</th></tr></thead>
            <tbody role="rowgroup">
              {pagination.pageItems.map((item) => (
                <tr role="row" key={item.id}>
                  <td role="cell" data-cell="primary">
                    <button className="person-detail-button" type="button" onClick={() => setAttendancePerson(item)} title={`Lihat rekap absensi ${item.fullName}`}>
                      <Person name={item.fullName} meta={`${item.gender} · ${item.phone || 'Nomor belum diisi'}`} />
                    </button>
                  </td>
                  <td role="cell" data-label="Aksi" data-cell="full"><div className="table-actions"><button className="text-button" onClick={() => setAttendancePerson(item)}><Eye size={14} /> Absensi</button><button className="text-button" onClick={() => openEdit(item)}>Edit</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={pagination.page} pageSize={pagination.pageSize} totalItems={filtered.length} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
      </article>

      <Modal
        open={modalOpen}
        title={jamaah.some((item) => item.id === form.id) ? 'Edit Warga' : 'Tambah Warga'}
        onClose={() => setModalOpen(false)}
        wide
        footer={<><button className="button outline" onClick={() => setModalOpen(false)}>Batal</button><button className="button primary" disabled={saving} onClick={() => void submit()}>{saving ? 'Menyimpan…' : 'Simpan'}</button></>}
      >
        <div className="form-grid">
          <label>Nama lengkap *<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
          <label>Jenis kelamin<select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value as Gender })}><option>Laki-laki</option><option>Perempuan</option></select></label>
          <label>Tanggal lahir (opsional)<DateField max={localIsoDate()} value={form.birthDate} onChange={(birthDate) => setForm({ ...form, birthDate })} /></label>
          <label>Nomor WhatsApp<input inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label>Kategori sensus<select value={form.censusCategory} onChange={(event) => setForm({ ...form, censusCategory: event.target.value as CensusCategory })}>{CENSUS_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <div className="status-readonly-field"><span>Status</span><strong className={`badge ${form.active ? 'success' : 'danger'}`}>{form.active ? 'Aktif' : 'Nonaktif'}</strong><small>Gunakan menu Status & Arsip untuk mengubah status agar alasan dan tanggal efektif tercatat.</small></div>
          <fieldset className="form-span-two"><legend>Kelas pengajian yang diikuti</legend><div className="checkbox-grid">{classes.filter((studyClass) => studyClass.active).map((studyClass) => <label className="checkbox-card" key={studyClass.id}><input type="checkbox" checked={form.classIds.includes(studyClass.id)} onChange={(event) => setForm({ ...form, classIds: event.target.checked ? [...form.classIds, studyClass.id] : form.classIds.filter((id) => id !== studyClass.id) })} /><span>{studyClass.name}</span></label>)}</div></fieldset>
        </div>
        {message ? <p className="form-error">{message}</p> : null}
      </Modal>

      <Modal
        open={Boolean(attendancePerson)}
        title="Detail Warga"
        onClose={() => setAttendancePerson(null)}
        wide
      >
        {attendancePerson ? (
          <>
            <div className="person-attendance-header">
              <Person
                name={attendancePerson.fullName}
                meta={`${attendancePerson.censusCategory} · ${attendancePerson.gender}`}
              />
              <div className="detail-attendance-rate">
                <small>Persentase Kehadiran</small>
                <strong>{personAttendanceRate}%</strong>
                <span>{personAttendanceCounts.present} hadir dari {visiblePersonAttendance.length} pencatatan{detailFiltered ? ' terpilih' : ''}</span>
              </div>
            </div>
            <dl className="person-facts">
              <div><dt>Jenis kelamin</dt><dd>{attendancePerson.gender}</dd></div>
              <div><dt>Kategori sensus</dt><dd>{attendancePerson.censusCategory}</dd></div>
              <div><dt>Tanggal lahir</dt><dd>{attendancePerson.birthDate ? `${formatDate(attendancePerson.birthDate)} · ${ageFromBirthDate(attendancePerson.birthDate)} tahun` : 'Belum diisi'}</dd></div>
              <div><dt>Nomor WhatsApp</dt><dd>{attendancePerson.phone || 'Belum diisi'}</dd></div>
              <div className="span-two">
                <dt>Kelas pengajian</dt>
                <dd>{attendancePerson.classIds.length
                  ? <div className="badge-list">{attendancePerson.classIds.map((id) => <span className="badge muted" key={id}>{classNameMap.get(id) ?? 'Kelas'}</span>)}</div>
                  : 'Belum terdaftar di kelas mana pun'}</dd>
              </div>
            </dl>
            <div className="detail-counts">
              <span className="badge success">Hadir {personAttendanceCounts.present}</span>
              <span className="badge info">Izin {personAttendanceCounts.excused}</span>
              <span className="badge warning">Sakit {personAttendanceCounts.sick}</span>
              <span className="badge danger">Alpa {personAttendanceCounts.absent}</span>
            </div>
            <div className="toolbar detail-filters">
              {personMonths.length > 1 ? (
                <select value={detailMonth} onChange={(event) => setDetailMonth(event.target.value)} aria-label="Saring bulan">
                  <option value="">Semua bulan</option>
                  {personMonths.map((item) => <option key={item} value={item}>{monthLabel(item)}</option>)}
                </select>
              ) : null}
              {personClassIds.length > 1 ? (
                <select value={detailClassId} onChange={(event) => setDetailClassId(event.target.value)} aria-label="Saring kelas">
                  <option value="">Semua kelas</option>
                  {personClassIds.map((item) => <option key={item} value={item}>{classNameMap.get(item) ?? 'Kelas'}</option>)}
                </select>
              ) : null}
              <select value={detailStatus} onChange={(event) => setDetailStatus(event.target.value as AttendanceStatus | '')} aria-label="Saring status">
                <option value="">Semua status</option>
                {ATTENDANCE_OPTIONS.map((item) => <option key={item} value={item}>{ATTENDANCE_LABELS[item]}</option>)}
              </select>
              {detailFiltered ? (
                <button className="text-button" type="button" onClick={() => { setDetailMonth(''); setDetailClassId(''); setDetailStatus('') }}>Tampilkan semua</button>
              ) : null}
            </div>
            <div className="table-wrap person-attendance-table">
              <table role="table">
                <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader" aria-sort={detailOldestFirst ? 'ascending' : 'descending'}><button className="th-sort" type="button" onClick={() => setDetailOldestFirst((value) => !value)}>Tanggal {detailOldestFirst ? <ArrowUpNarrowWide size={14} /> : <ArrowDownNarrowWide size={14} />}</button></th><th scope="col" role="columnheader">Kelas</th><th scope="col" role="columnheader">Materi</th><th scope="col" role="columnheader">Status</th></tr></thead>
                <tbody role="rowgroup">
                  {visiblePersonAttendance.map(({ session, status }) => (
                    <tr role="row" key={session.id}>
                      <td role="cell" data-label="Tanggal">{formatDate(session.date)}</td>
                      <td role="cell" data-label="Kelas">
                        <strong>{classes.find((item) => item.id === session.classId)?.name ?? 'Kelas'}</strong>
                        {session.generatedFromSessionId ? <small className="generated-session-note">Otomatis dari Pengajian Umum</small> : null}
                      </td>
                      <td role="cell" data-label="Materi">{materialDisplayName(session.materialType, session.materialName)}</td>
                      <td role="cell" data-label="Status"><span className={`badge ${status === 'present' ? 'success' : status === 'excused' ? 'info' : status === 'sick' ? 'warning' : 'danger'}`}>{ATTENDANCE_LABELS[status]}</span></td>
                    </tr>
                  ))}
                  {!visiblePersonAttendance.length ? <tr role="row"><td role="cell" colSpan={4}><div className="empty-state">{detailFiltered ? 'Tidak ada absensi yang cocok dengan saringan ini.' : 'Belum ada absensi yang tercatat untuk warga ini.'}</div></td></tr> : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  )
}
