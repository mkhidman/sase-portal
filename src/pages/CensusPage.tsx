import { Archive, Download, FileDown, FileSpreadsheet, Plus, Search, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { PageHeader, Person, StatCard } from '../components/UI'
import { useData } from '../contexts/DataContext'
import { usePagination } from '../hooks/usePagination'
import { CENSUS_CATEGORIES } from '../lib/constants'
import { buildJamaahImportPreview, type JamaahImportPreview } from '../lib/csvImport'
import { ageFromBirthDate, downloadCsv, localIsoDate } from '../lib/utils'
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
  const { jamaah, classes, saveJamaah, importJamaah } = useData()
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
        <StatCard label="Total Aktif" value={active.length} note="Seluruh kategori" icon={<span>T</span>} />
        <StatCard label="Laki-laki" value={active.filter((item) => item.gender === 'Laki-laki').length} note="Data sensus aktif" icon={<span>L</span>} />
        <StatCard label="Perempuan" value={active.filter((item) => item.gender === 'Perempuan').length} note="Data sensus aktif" icon={<span>P</span>} />
        <StatCard label="Kategori Sensus" value={CENSUS_CATEGORIES.length} note="Kategori utama" icon={<span>K</span>} />
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
          <table>
            <thead><tr><th>Warga</th><th>Usia</th><th>Kategori sensus</th><th>Kelas pengajian</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>
              {pagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td><Person name={item.fullName} meta={`${item.gender} · ${item.phone || 'Nomor belum diisi'}`} /></td>
                  <td>{item.birthDate ? `${ageFromBirthDate(item.birthDate)} tahun` : 'Belum diisi'}</td>
                  <td><span className="badge info">{item.censusCategory}</span></td>
                  <td><div className="badge-list">{item.classIds.map((id) => <span className="badge muted" key={id}>{classes.find((studyClass) => studyClass.id === id)?.name ?? 'Kelas'}</span>)}</div></td>
                  <td><span className={`badge ${item.active ? 'success' : 'danger'}`}>{item.active ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td><button className="text-button" onClick={() => openEdit(item)}>Edit</button></td>
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
              <table>
                <thead><tr><th>Baris</th><th>Nama</th><th>Status</th><th>Keterangan</th></tr></thead>
                <tbody>
                  {importRows.slice(0, 100).map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td><strong>{row.rawName || 'Tanpa nama'}</strong></td>
                      <td><span className={`badge ${row.status === 'valid' ? 'success' : row.status === 'duplicate' ? 'warning' : 'danger'}`}>{row.status === 'valid' ? 'Valid' : row.status === 'duplicate' ? 'Duplikat' : 'Perlu diperbaiki'}</span></td>
                      <td>{row.messages.join(' ') || `${row.jamaah?.censusCategory ?? ''} · ${row.jamaah?.classIds.length ?? 0} kelas`}</td>
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
