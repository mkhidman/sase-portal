import {
  Archive,
  CalendarDays,
  Download,
  History,
  RotateCcw,
  Search,
  UserCheck,
  UserX,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { PageHeader, Person, StatCard } from '../components/UI'
import { useData } from '../contexts/DataContext'
import { usePagination } from '../hooks/usePagination'
import { JAMAAH_DEACTIVATION_REASONS, JAMAAH_STATUS_REASON_LABELS } from '../lib/constants'
import { downloadCsv, formatDate, formatDateTime, localIsoDate } from '../lib/utils'
import type { Jamaah, JamaahStatusHistory, JamaahStatusReason } from '../types/domain'

type StatusFilter = 'all' | 'active' | 'inactive'
type ChangeMode = 'deactivate' | 'reactivate'

interface ChangeForm {
  effectiveDate: string
  reason: JamaahStatusReason
  notes: string
  classIds: string[]
}

const EMPTY_FORM: ChangeForm = {
  effectiveDate: localIsoDate(),
  reason: 'stopped',
  notes: '',
  classIds: [],
}

export function JamaahArchivePage() {
  const {
    jamaah,
    classes,
    statusHistory,
    setJamaahActiveStatus,
    isPeriodClosed,
  } = useData()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [reasonFilter, setReasonFilter] = useState<JamaahStatusReason | 'all'>('all')
  const [selectedPerson, setSelectedPerson] = useState<Jamaah | null>(null)
  const [changeMode, setChangeMode] = useState<ChangeMode>('deactivate')
  const [changeOpen, setChangeOpen] = useState(false)
  const [historyPerson, setHistoryPerson] = useState<Jamaah | null>(null)
  const [form, setForm] = useState<ChangeForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pageMessage, setPageMessage] = useState<string | null>(null)

  const classMap = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes])
  const personMap = useMemo(() => new Map(jamaah.map((item) => [item.id, item])), [jamaah])
  const historiesByPerson = useMemo(() => {
    const map = new Map<string, JamaahStatusHistory[]>()
    statusHistory.forEach((item) => {
      const current = map.get(item.jamaahId) ?? []
      current.push(item)
      map.set(item.jamaahId, current)
    })
    map.forEach((items) => items.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt)))
    return map
  }, [statusHistory])

  const latestHistory = (jamaahId: string) => historiesByPerson.get(jamaahId)?.[0]
  const lastKnownClasses = (person: Jamaah) => person.active
    ? person.classIds
    : latestHistory(person.id)?.classIds ?? []

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return jamaah
      .filter((person) => {
        const latest = latestHistory(person.id)
        const classNames = lastKnownClasses(person).map((id) => classMap.get(id) ?? '').join(' ')
        const haystack = [person.fullName, person.phone, person.censusCategory, classNames, latest?.notes ?? ''].join(' ').toLowerCase()
        const statusMatches = statusFilter === 'all' || (statusFilter === 'active' ? person.active : !person.active)
        const reasonMatches = reasonFilter === 'all' || latest?.reason === reasonFilter
        return (!query || haystack.includes(query)) && statusMatches && reasonMatches
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || a.fullName.localeCompare(b.fullName, 'id'))
  }, [classMap, historiesByPerson, jamaah, reasonFilter, search, statusFilter])

  const pagination = usePagination(filtered, `${search}|${statusFilter}|${reasonFilter}`)

  const activeCount = jamaah.filter((item) => item.active).length
  const inactiveCount = jamaah.length - activeCount
  const currentMonth = localIsoDate().slice(0, 7)
  const changesThisMonth = statusHistory.filter((item) => item.effectiveDate.startsWith(currentMonth)).length
  const restoredCount = statusHistory.filter((item) => item.newActive).length
  const closed = Boolean(form.effectiveDate && isPeriodClosed(form.effectiveDate.slice(0, 7)))

  function openChange(person: Jamaah, mode: ChangeMode) {
    const latest = latestHistory(person.id)
    setSelectedPerson(person)
    setChangeMode(mode)
    const activeClassIds = new Set(classes.filter((item) => item.active).map((item) => item.id))
    setForm({
      effectiveDate: localIsoDate(),
      reason: mode === 'reactivate' ? 'reactivated' : 'stopped',
      notes: '',
      classIds: mode === 'reactivate'
        ? (latest?.classIds ?? []).filter((classId) => activeClassIds.has(classId))
        : [...person.classIds],
    })
    setMessage(null)
    setChangeOpen(true)
  }

  function toggleClass(classId: string) {
    setForm((current) => ({
      ...current,
      classIds: current.classIds.includes(classId)
        ? current.classIds.filter((id) => id !== classId)
        : [...current.classIds, classId],
    }))
  }

  async function submitChange() {
    if (!selectedPerson || !form.effectiveDate) return
    if (changeMode === 'reactivate' && !form.classIds.length) {
      setMessage('Pilih minimal satu kelas untuk mengaktifkan kembali warga.')
      return
    }
    if (closed) {
      setMessage('Periode tanggal efektif sudah ditutup. Pilih tanggal pada periode terbuka.')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      await setJamaahActiveStatus({
        jamaahId: selectedPerson.id,
        active: changeMode === 'reactivate',
        reason: changeMode === 'reactivate' ? 'reactivated' : form.reason,
        effectiveDate: form.effectiveDate,
        notes: form.notes.trim(),
        classIds: changeMode === 'reactivate' ? form.classIds : selectedPerson.classIds,
      })
      setChangeOpen(false)
      setPageMessage(changeMode === 'reactivate'
        ? `${selectedPerson.fullName} berhasil diaktifkan kembali.`
        : `${selectedPerson.fullName} berhasil dipindahkan ke arsip.`)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Perubahan status gagal disimpan.')
    } finally {
      setSaving(false)
    }
  }

  function exportHistory() {
    downloadCsv('riwayat-status-warga.csv', [
      ['Tanggal Efektif', 'Nama Warga', 'Perubahan', 'Alasan', 'Kelas Terkait', 'Catatan', 'Waktu Dicatat'],
      ...statusHistory.map((item) => [
        item.effectiveDate,
        personMap.get(item.jamaahId)?.fullName ?? 'Warga',
        item.newActive ? 'Diaktifkan kembali' : 'Dinonaktifkan / diarsipkan',
        JAMAAH_STATUS_REASON_LABELS[item.reason],
        item.classIds.map((id) => classMap.get(id) ?? id).join(' | '),
        item.notes,
        item.createdAt,
      ]),
    ])
  }

  const selectedHistory = historyPerson ? historiesByPerson.get(historyPerson.id) ?? [] : []

  return (
    <>
      <PageHeader
        title="Status & Arsip Warga"
        description="Nonaktifkan warga tanpa menghapus absensi lama, simpan alasan dan tanggal efektif, lalu aktifkan kembali bila diperlukan."
        actions={<button className="button outline" type="button" onClick={exportHistory}><Download size={16} /> Ekspor Riwayat</button>}
      />

      {pageMessage ? <div className="inline-message page-message">{pageMessage}</div> : null}

      <section className="stats-grid four-columns compact-stats archive-stats">
        <StatCard label="Warga Aktif" value={activeCount} note="Masuk kelas dan absensi" icon={<UserCheck size={18} />} />
        <StatCard label="Warga Nonaktif" value={inactiveCount} note="Tersimpan dalam arsip" icon={<Archive size={18} />} />
        <StatCard label="Perubahan Bulan Ini" value={changesThisMonth} note="Aktif maupun nonaktif" icon={<CalendarDays size={18} />} />
        <StatCard label="Pernah Aktif Kembali" value={restoredCount} note="Riwayat reaktivasi" icon={<RotateCcw size={18} />} />
      </section>

      <div className="notice archive-notice">
        Warga yang diarsipkan tidak muncul pada daftar absensi baru dan keanggotaannya dilepas dari kelas aktif. Absensi, ketuntasan materi, serta laporan periode lama tetap dipertahankan.
      </div>

      <article className="card">
        <div className="toolbar archive-toolbar">
          <label className="search-field"><Search size={16} /><input placeholder="Cari nama, nomor, kelas terakhir, atau catatan…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif / arsip</option>
          </select>
          <select value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value as JamaahStatusReason | 'all')}>
            <option value="all">Semua alasan terakhir</option>
            {Object.entries(JAMAAH_STATUS_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        <div className="table-wrap archive-table">
          <table role="table">
            <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Warga</th><th scope="col" role="columnheader">Kategori</th><th scope="col" role="columnheader">Kelas aktif/terakhir</th><th scope="col" role="columnheader">Status</th><th scope="col" role="columnheader">Perubahan terakhir</th><th scope="col" role="columnheader">Aksi</th></tr></thead>
            <tbody role="rowgroup">
              {pagination.pageItems.map((person) => {
                const latest = latestHistory(person.id)
                const classIds = lastKnownClasses(person)
                return (
                  <tr role="row" key={person.id}>
                    <td role="cell" data-cell="primary"><Person name={person.fullName} meta={`${person.gender} · ${person.phone || 'Nomor belum diisi'}`} /></td>
                    <td role="cell" data-label="Kategori"><span className="badge info">{person.censusCategory}</span></td>
                    <td role="cell" data-label="Kelas aktif/terakhir"><div className="badge-list">{classIds.length ? classIds.map((id) => <span className="badge muted" key={id}>{classMap.get(id) ?? 'Kelas'}</span>) : <span className="muted-copy">Belum ada kelas</span>}</div></td>
                    <td role="cell" data-label="Status"><span className={`badge ${person.active ? 'success' : 'danger'}`}>{person.active ? 'Aktif' : 'Nonaktif'}</span></td>
                    <td role="cell" data-label="Perubahan terakhir">
                      {latest ? (
                        <span className="archive-last-change">
                          <strong>{JAMAAH_STATUS_REASON_LABELS[latest.reason]}</strong>
                          <small>{formatDate(latest.effectiveDate)}</small>
                        </span>
                      ) : <span className="muted-copy">Belum ada riwayat</span>}
                    </td>
                    <td role="cell" data-label="Aksi" data-cell="full">
                      <div className="table-actions">
                        <button className="text-button" type="button" onClick={() => setHistoryPerson(person)}><History size={14} /> Riwayat</button>
                        {person.active
                          ? <button className="text-button danger-text" type="button" onClick={() => openChange(person, 'deactivate')}><UserX size={14} /> Arsipkan</button>
                          : <button className="text-button" type="button" onClick={() => openChange(person, 'reactivate')}><RotateCcw size={14} /> Aktifkan</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!filtered.length ? <tr role="row"><td role="cell" colSpan={6}><div className="empty-state">Data warga tidak ditemukan.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
        <Pagination page={pagination.page} pageSize={pagination.pageSize} totalItems={filtered.length} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
      </article>

      <Modal
        open={changeOpen && Boolean(selectedPerson)}
        title={changeMode === 'reactivate' ? 'Aktifkan Kembali Warga' : 'Arsipkan Warga'}
        onClose={() => !saving && setChangeOpen(false)}
        wide
        footer={
          <>
            <button className="button outline" type="button" disabled={saving} onClick={() => setChangeOpen(false)}>Batal</button>
            <button className={`button ${changeMode === 'reactivate' ? 'primary' : 'danger'}`} type="button" disabled={saving || closed} onClick={() => void submitChange()}>
              {saving ? 'Menyimpan…' : changeMode === 'reactivate' ? 'Aktifkan Kembali' : 'Pindahkan ke Arsip'}
            </button>
          </>
        }
      >
        {selectedPerson ? (
          <>
            <div className={`archive-modal-summary ${changeMode === 'reactivate' ? 'restore' : 'deactivate'}`}>
              {changeMode === 'reactivate' ? <UserCheck size={22} /> : <Archive size={22} />}
              <div><strong>{selectedPerson.fullName}</strong><p>{changeMode === 'reactivate' ? 'Warga akan kembali muncul pada kelas dan absensi baru.' : 'Data lama tidak dihapus dan tetap tersedia pada laporan historis.'}</p></div>
            </div>
            <div className="form-grid archive-form-grid">
              <label>Tanggal efektif *<input type="date" max={localIsoDate()} value={form.effectiveDate} onChange={(event) => setForm({ ...form, effectiveDate: event.target.value })} /></label>
              {changeMode === 'deactivate' ? (
                <label>Alasan *<select value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value as JamaahStatusReason })}>{JAMAAH_DEACTIVATION_REASONS.map((reason) => <option key={reason} value={reason}>{JAMAAH_STATUS_REASON_LABELS[reason]}</option>)}</select></label>
              ) : (
                <label>Status perubahan<input value="Diaktifkan kembali" disabled /></label>
              )}
              <label className="form-span-two">Catatan<textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder={changeMode === 'reactivate' ? 'Contoh: kembali aktif setelah pindah ke wilayah ini.' : 'Contoh: pindah domisili ke luar wilayah.'} /></label>
              {changeMode === 'reactivate' ? (
                <fieldset className="form-span-two"><legend>Kelas yang akan diikuti *</legend><div className="checkbox-grid">{classes.filter((item) => item.active).map((studyClass) => <label className={`checkbox-card ${form.classIds.includes(studyClass.id) ? 'selected' : ''}`} key={studyClass.id}><input type="checkbox" checked={form.classIds.includes(studyClass.id)} onChange={() => toggleClass(studyClass.id)} /><span>{studyClass.name}</span></label>)}</div></fieldset>
              ) : (
                <div className="form-span-two archive-removed-classes"><strong>Kelas yang akan dilepas</strong><div className="badge-list">{selectedPerson.classIds.map((id) => <span className="badge muted" key={id}>{classMap.get(id) ?? 'Kelas'}</span>)}</div></div>
              )}
            </div>
            {closed ? <div className="form-error">Periode tanggal efektif sudah ditutup.</div> : null}
            {message ? <div className="form-error">{message}</div> : null}
          </>
        ) : null}
      </Modal>

      <Modal open={Boolean(historyPerson)} title={`Riwayat Status · ${historyPerson?.fullName ?? ''}`} onClose={() => setHistoryPerson(null)} wide>
        {selectedHistory.length ? (
          <div className="status-history-list">
            {selectedHistory.map((item) => (
              <article key={item.id} className="status-history-item">
                <span className={`status-history-icon ${item.newActive ? 'active' : 'inactive'}`}>{item.newActive ? <UserCheck size={17} /> : <Archive size={17} />}</span>
                <div>
                  <div className="status-history-heading"><strong>{item.newActive ? 'Diaktifkan kembali' : 'Dipindahkan ke arsip'}</strong><span className={`badge ${item.newActive ? 'success' : 'danger'}`}>{JAMAAH_STATUS_REASON_LABELS[item.reason]}</span></div>
                  <p>{item.notes || 'Tidak ada catatan.'}</p>
                  <div className="badge-list">{item.classIds.map((id) => <span className="badge muted" key={id}>{classMap.get(id) ?? 'Kelas'}</span>)}</div>
                  <small>Efektif {formatDate(item.effectiveDate)} · Dicatat {formatDateTime(item.createdAt)}</small>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="empty-state">Belum ada riwayat perubahan status.</div>}
      </Modal>
    </>
  )
}
