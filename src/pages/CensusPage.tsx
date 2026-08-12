import { Archive, Download, Eye, FileDown, FileSpreadsheet, Layers, Mars, Plus, Search, Upload, UsersRound, Venus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { PageHeader, Person, StatCard } from '../components/UI'
import { useData } from '../contexts/DataContext'
import { usePagination } from '../hooks/usePagination'
import { ATTENDANCE_LABELS, CENSUS_CATEGORIES } from '../lib/constants'
import { buildJamaahImportPreview, type JamaahImportPreview } from '../lib/csvImport'
import { ageFromBirthDate, attendanceCounts, downloadCsv, formatDate, localIsoDate, materialDisplayName, percentage } from '../lib/utils'
import type { CensusCategory, Gender, Jamaah } from '../types/domain'

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
  const { jamaah, classes, attendanceSessions, saveJamaah, importJamaah } = useData()
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

  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<JamaahImportPreview[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const active = jamaah.filter((item) => item.active)
  const censusGenderSummary = useMemo(() => CENSUS_CATEGORIES.map((categoryName) => {
    const members = jamaah.filter((item) => item.active && item.censusCategory === categoryName)
    const male = members.filter((item) => item.gender === 'Laki-laki').length
    const female = members.filter((item) => item.gender === 'Perempuan').length
    return { categoryName, male, female, total: members.length }
  }), [jamaah])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return jamaah.filter((item) => {
      const text = [item.fullName, item.phone, item.censusCategory].join(' ').toLowerCase()
      return (!query || text.includes(query)) && (!category || item.censusCategory === category) && (!gender || item.gender === gender)
    })
  }, [category, gender, jamaah, search])

  const pagination = usePagination(filtered, `${search}|${category}|${gender}`)

  const importSummary = useMemo(() => ({
    valid: importRows.filter((row) => row.status === 'valid').length,
    invalid: importRows.filter((row) => row.status === 'invalid').length,
    duplicate: importRows.filter((row) => row.status === 'duplicate').length,
  }), [importRows])

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
  const personAttendanceCounts = attendanceCounts(Object.fromEntries(
    personAttendance.map((item, index) => [String(index), item.status]),
  ))
  const personAttendanceRate = percentage(personAttendanceCounts.present, personAttendance.length)

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

  function exportData() {
    downloadCsv('data-sensus-warga.csv', [
      ['Nama', 'Jenis Kelamin', 'Tanggal Lahir', 'Usia', 'WhatsApp', 'Kategori Sensus', 'Kelas Pengajian', 'Status'],
      ...jamaah.map((item) => [
        item.fullName,
        item.gender,
        item.birthDate,
        ageFromBirthDate(item.birthDate) ?? '',
        item.phone,
        item.censusCategory,
        item.classIds.map((id) => classes.find((studyClass) => studyClass.id === id)?.name ?? id).join(' | '),
        item.active ? 'Aktif' : 'Nonaktif',
      ]),
    ])
  }

  function exportCensusSummary() {
    downloadCsv('ringkasan-kategori-sensus.csv', [
      ['Kategori Sensus', 'Laki-laki', 'Perempuan', 'Total'],
      ...censusGenderSummary.map((item) => [item.categoryName, item.male, item.female, item.total]),
      ['TOTAL', active.filter((item) => item.gender === 'Laki-laki').length, active.filter((item) => item.gender === 'Perempuan').length, active.length],
    ])
  }

  function downloadTemplate() {
    downloadCsv('template-import-sensus-warga.csv', [
      ['Nama', 'Jenis Kelamin', 'Tanggal Lahir', 'WhatsApp', 'Kategori Sensus', 'Kelas Pengajian', 'Status'],
      ['Ahmad Fauzan', 'Laki-laki', '2014-04-14', '081234567890', 'Caberawit', 'Caberawit Kelas C', 'Aktif'],
      ['Nur Aisyah', 'Perempuan', '', '081234567891', 'Remaja', 'Remaja | Pengajian Umum', 'Aktif'],
    ])
  }

  function openImport() {
    setImportRows([])
    setImportFileName('')
    setImportError(null)
    setImportOpen(true)
  }

  async function readImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setImportFileName(file.name)
    setImportError(null)
    try {
      const text = await file.text()
      setImportRows(buildJamaahImportPreview(text, jamaah, classes, CENSUS_CATEGORIES))
    } catch (cause) {
      setImportRows([])
      setImportError(cause instanceof Error ? cause.message : 'File CSV tidak dapat dibaca.')
    } finally {
      event.target.value = ''
    }
  }

  async function submitImport() {
    const valid = importRows.flatMap((row) => row.status === 'valid' && row.jamaah ? [row.jamaah] : [])
    if (!valid.length) {
      setImportError('Tidak ada baris valid yang dapat diimpor.')
      return
    }
    setImporting(true)
    setImportError(null)
    try {
      const imported = await importJamaah(valid)
      setImportOpen(false)
      setPageMessage(`${imported} warga berhasil diimpor. ${importSummary.duplicate} duplikat dan ${importSummary.invalid} baris bermasalah dilewati.`)
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : 'Import data gagal.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Data Sensus Warga"
        description="Kategori sensus dipisahkan dari kelas pengajian. Perubahan status aktif dikelola melalui Status & Arsip agar riwayatnya tersimpan."
        actions={
          <>
            <Link className="button outline" to="/arsip-jamaah"><Archive size={16} /> Status & Arsip</Link>
            <button className="button outline" onClick={openImport}><Upload size={16} /> Import CSV</button>
            <button className="button outline" onClick={exportData}><Download size={16} /> Ekspor CSV</button>
            <button className="button primary" onClick={openCreate}><Plus size={16} /> Tambah Warga</button>
          </>
        }
      />

      {pageMessage ? <div className="inline-message page-message">{pageMessage}</div> : null}

      <section className="stats-grid four-columns compact-stats">
        <StatCard label="Total Aktif" value={active.length} note="Seluruh kategori" icon={<UsersRound size={20} />} />
        <StatCard label="Laki-laki" value={active.filter((item) => item.gender === 'Laki-laki').length} note="Data sensus aktif" icon={<Mars size={20} />} />
        <StatCard label="Perempuan" value={active.filter((item) => item.gender === 'Perempuan').length} note="Data sensus aktif" icon={<Venus size={20} />} />
        <StatCard label="Kategori Sensus" value={CENSUS_CATEGORIES.length} note="Kategori utama" icon={<Layers size={20} />} />
      </section>

      <article className="card census-composition-card">
        <div className="card-heading">
          <div>
            <h2>Ringkasan Kategori Sensus</h2>
            <p>Jumlah warga aktif laki-laki dan perempuan pada setiap kategori sensus.</p>
          </div>
          <button className="button outline small" type="button" onClick={exportCensusSummary}><FileDown size={15} /> Ekspor Ringkasan</button>
        </div>
        <div className="census-gender-grid">
          {censusGenderSummary.map((item) => (
            <div className="census-gender-card" key={item.categoryName}>
              <strong>{item.categoryName}</strong>
              <div className="census-gender-values">
                <span><small>Laki-laki</small><b>{item.male}</b></span>
                <span><small>Perempuan</small><b>{item.female}</b></span>
                <span className="census-total"><small>Total</small><b>{item.total}</b></span>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="card">
        <div className="toolbar">
          <label className="search-field"><Search size={16} /><input placeholder="Cari nama atau nomor WhatsApp…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <select value={category} onChange={(event) => setCategory(event.target.value as CensusCategory | '')}><option value="">Semua kategori</option>{CENSUS_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={gender} onChange={(event) => setGender(event.target.value as Gender | '')}><option value="">Semua gender</option><option>Laki-laki</option><option>Perempuan</option></select>
        </div>
        <div className="table-wrap">
          <table role="table">
            <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Warga</th><th scope="col" role="columnheader">Usia</th><th scope="col" role="columnheader">Kategori sensus</th><th scope="col" role="columnheader">Kelas pengajian</th><th scope="col" role="columnheader">Status</th><th scope="col" role="columnheader">Aksi</th></tr></thead>
            <tbody role="rowgroup">
              {pagination.pageItems.map((item) => (
                <tr role="row" key={item.id}>
                  <td role="cell" data-cell="primary">
                    <button className="person-detail-button" type="button" onClick={() => setAttendancePerson(item)} title={`Lihat rekap absensi ${item.fullName}`}>
                      <Person name={item.fullName} meta={`${item.gender} · ${item.phone || 'Nomor belum diisi'}`} />
                    </button>
                  </td>
                  <td role="cell" data-label="Usia">{item.birthDate ? `${ageFromBirthDate(item.birthDate)} tahun` : 'Belum diisi'}</td>
                  <td role="cell" data-label="Kategori sensus"><span className="badge info">{item.censusCategory}</span></td>
                  <td role="cell" data-label="Kelas pengajian"><div className="badge-list">{item.classIds.map((id) => <span className="badge muted" key={id}>{classes.find((studyClass) => studyClass.id === id)?.name ?? 'Kelas'}</span>)}</div></td>
                  <td role="cell" data-label="Status"><span className={`badge ${item.active ? 'success' : 'danger'}`}>{item.active ? 'Aktif' : 'Nonaktif'}</span></td>
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
          <label>Tanggal lahir (opsional)<input type="date" max={localIsoDate()} value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })} /></label>
          <label>Nomor WhatsApp<input inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label>Kategori sensus<select value={form.censusCategory} onChange={(event) => setForm({ ...form, censusCategory: event.target.value as CensusCategory })}>{CENSUS_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <div className="status-readonly-field"><span>Status</span><strong className={`badge ${form.active ? 'success' : 'danger'}`}>{form.active ? 'Aktif' : 'Nonaktif'}</strong><small>Gunakan menu Status & Arsip untuk mengubah status agar alasan dan tanggal efektif tercatat.</small></div>
          <fieldset className="form-span-two"><legend>Kelas pengajian yang diikuti</legend><div className="checkbox-grid">{classes.filter((studyClass) => studyClass.active).map((studyClass) => <label className="checkbox-card" key={studyClass.id}><input type="checkbox" checked={form.classIds.includes(studyClass.id)} onChange={(event) => setForm({ ...form, classIds: event.target.checked ? [...form.classIds, studyClass.id] : form.classIds.filter((id) => id !== studyClass.id) })} /><span>{studyClass.name}</span></label>)}</div></fieldset>
        </div>
        {message ? <p className="form-error">{message}</p> : null}
      </Modal>

      <Modal
        open={Boolean(attendancePerson)}
        title="Rekap Absensi Warga"
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
                <span>{personAttendanceCounts.present} hadir dari {personAttendance.length} pencatatan</span>
              </div>
            </div>
            <div className="detail-counts">
              <span className="badge success">Hadir {personAttendanceCounts.present}</span>
              <span className="badge info">Izin {personAttendanceCounts.excused}</span>
              <span className="badge warning">Sakit {personAttendanceCounts.sick}</span>
              <span className="badge danger">Alpa {personAttendanceCounts.absent}</span>
            </div>
            <div className="table-wrap person-attendance-table">
              <table role="table">
                <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Tanggal</th><th scope="col" role="columnheader">Kelas</th><th scope="col" role="columnheader">Materi</th><th scope="col" role="columnheader">Status</th></tr></thead>
                <tbody role="rowgroup">
                  {personAttendance.map(({ session, status }) => (
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
                  {!personAttendance.length ? <tr role="row"><td role="cell" colSpan={4}><div className="empty-state">Belum ada absensi yang tercatat untuk warga ini.</div></td></tr> : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={importOpen}
        title="Import Data Sensus"
        onClose={() => !importing && setImportOpen(false)}
        wide
        footer={
          <>
            <button className="button outline" disabled={importing} onClick={() => setImportOpen(false)}>Batal</button>
            <button className="button primary" disabled={importing || importSummary.valid === 0} onClick={() => void submitImport()}>
              {importing ? 'Mengimpor…' : `Import ${importSummary.valid} Warga`}
            </button>
          </>
        }
      >
        <div className="import-intro">
          <div>
            <strong>Gunakan format CSV agar data lama dapat dimasukkan sekaligus.</strong>
            <p>Tanggal lahir boleh dikosongkan. Nama kelas yang lebih dari satu dipisahkan dengan tanda <code>|</code>. Baris duplikat tidak akan diimpor.</p>
          </div>
          <button className="button soft" onClick={downloadTemplate}><FileDown size={16} /> Unduh Template</button>
        </div>

        <input ref={fileInputRef} className="visually-hidden" type="file" accept=".csv,text/csv" onChange={(event) => void readImportFile(event)} />
        <button className="import-dropzone" type="button" onClick={() => fileInputRef.current?.click()}>
          <FileSpreadsheet size={28} />
          <span><strong>{importFileName || 'Pilih file CSV'}</strong><small>Klik untuk memilih atau mengganti file</small></span>
        </button>

        {importRows.length ? (
          <>
            <div className="import-summary">
              <div><span>Siap diimpor</span><strong>{importSummary.valid}</strong></div>
              <div><span>Duplikat</span><strong>{importSummary.duplicate}</strong></div>
              <div><span>Bermasalah</span><strong>{importSummary.invalid}</strong></div>
            </div>
            <div className="import-preview table-wrap">
              <table role="table">
                <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Baris</th><th scope="col" role="columnheader">Nama</th><th scope="col" role="columnheader">Status</th><th scope="col" role="columnheader">Keterangan</th></tr></thead>
                <tbody role="rowgroup">
                  {importRows.slice(0, 100).map((row) => (
                    <tr role="row" key={row.rowNumber}>
                      <td role="cell" data-label="Baris">{row.rowNumber}</td>
                      <td role="cell" data-label="Nama"><strong>{row.rawName || 'Tanpa nama'}</strong></td>
                      <td role="cell" data-label="Status"><span className={`badge ${row.status === 'valid' ? 'success' : row.status === 'duplicate' ? 'warning' : 'danger'}`}>{row.status === 'valid' ? 'Valid' : row.status === 'duplicate' ? 'Duplikat' : 'Perlu diperbaiki'}</span></td>
                      <td role="cell" data-label="Keterangan" data-cell="full">{row.messages.join(' ') || `${row.jamaah?.censusCategory ?? ''} · ${row.jamaah?.classIds.length ?? 0} kelas`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {importRows.length > 100 ? <p className="modal-help">Preview dibatasi 100 baris pertama. Seluruh baris valid tetap akan diimpor.</p> : null}
          </>
        ) : null}
        {importError ? <div className="form-error">{importError}</div> : null}
      </Modal>
    </>
  )
}
