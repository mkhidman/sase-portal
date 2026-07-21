import {
  ArrowRight,
  CheckSquare2,
  Download,
  History,
  Search,
  Shuffle,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { PageHeader, Person, StatCard } from '../components/UI'
import { useData } from '../contexts/DataContext'
import { usePagination } from '../hooks/usePagination'
import { CLASS_PROGRESSION } from '../lib/constants'
import {
  censusCategoryForClassName,
  downloadCsv,
  formatDate,
  formatDateTime,
  localIsoDate,
} from '../lib/utils'
import type { ClassChangeType } from '../types/domain'

function changeTypeLabel(value: ClassChangeType): string {
  if (value === 'promotion') return 'Kenaikan kelas'
  if (value === 'transfer') return 'Mutasi kelas'
  return 'Penyesuaian manual'
}

export function ClassProgressionPage() {
  const {
    classes,
    jamaah,
    classHistory,
    applyClassTransition,
    isPeriodClosed,
  } = useData()

  const activeClasses = useMemo(() => classes.filter((item) => item.active), [classes])
  const classMap = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes])
  const personMap = useMemo(() => new Map(jamaah.map((item) => [item.id, item])), [jamaah])

  const initialSource = activeClasses.find((item) => item.name === 'Playgroup')?.id ?? activeClasses[0]?.id ?? ''
  const [sourceClassId, setSourceClassId] = useState(initialSource)
  const [targetClassId, setTargetClassId] = useState('')
  const [changeType, setChangeType] = useState<ClassChangeType>('promotion')
  const [effectiveDate, setEffectiveDate] = useState(localIsoDate())
  const [updateCensus, setUpdateCensus] = useState(true)
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [historySearch, setHistorySearch] = useState('')
  const [historyClassId, setHistoryClassId] = useState('all')

  const sourceClass = activeClasses.find((item) => item.id === sourceClassId)
  const targetClass = activeClasses.find((item) => item.id === targetClassId)
  const recommendedTargetName = sourceClass ? CLASS_PROGRESSION[sourceClass.name] : undefined
  const recommendedTarget = activeClasses.find((item) => item.name === recommendedTargetName)

  useEffect(() => {
    if (!sourceClassId && activeClasses[0]) setSourceClassId(activeClasses[0].id)
  }, [activeClasses, sourceClassId])

  useEffect(() => {
    if (!sourceClass) return
    const recommendedName = CLASS_PROGRESSION[sourceClass.name]
    const recommended = activeClasses.find((item) => item.name === recommendedName)
    const currentTargetValid = activeClasses.some((item) => item.id === targetClassId && item.id !== sourceClass.id)
    if (!currentTargetValid || changeType === 'promotion') {
      setTargetClassId(recommended?.id ?? activeClasses.find((item) => item.id !== sourceClass.id)?.id ?? '')
    }
    setSelectedIds([])
  }, [activeClasses, changeType, sourceClass, targetClassId])

  const sourceMembers = useMemo(
    () => jamaah.filter((person) => person.active && person.classIds.includes(sourceClassId)),
    [jamaah, sourceClassId],
  )

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase()
    return sourceMembers.filter((person) =>
      !query || [person.fullName, person.censusCategory, person.phone].join(' ').toLowerCase().includes(query),
    )
  }, [search, sourceMembers])

  const memberPagination = usePagination(filteredMembers, `${sourceClassId}|${search}`)

  const selectedMembers = sourceMembers.filter((person) => selectedIds.includes(person.id))
  const allFilteredSelected = filteredMembers.length > 0 && filteredMembers.every((person) => selectedIds.includes(person.id))
  const targetCensusCategory = targetClass
    ? censusCategoryForClassName(targetClass.name, selectedMembers[0]?.censusCategory ?? sourceMembers[0]?.censusCategory ?? 'Caberawit')
    : null
  const closed = effectiveDate ? isPeriodClosed(effectiveDate.slice(0, 7)) : false
  const sameClass = Boolean(sourceClassId && targetClassId && sourceClassId === targetClassId)

  function toggleMember(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function toggleAllFiltered() {
    setSelectedIds((current) => {
      if (allFilteredSelected) {
        const filteredSet = new Set(filteredMembers.map((item) => item.id))
        return current.filter((id) => !filteredSet.has(id))
      }
      return [...new Set([...current, ...filteredMembers.map((item) => item.id)])]
    })
  }

  async function submitTransition() {
    if (!sourceClassId || !targetClassId || !effectiveDate || !selectedIds.length || sameClass) return
    setSaving(true)
    setMessage(null)
    try {
      const count = await applyClassTransition({
        jamaahIds: selectedIds,
        fromClassId: sourceClassId,
        toClassId: targetClassId,
        effectiveDate,
        changeType,
        notes: notes.trim(),
        updateCensusCategory: updateCensus,
      })
      setConfirmOpen(false)
      setSelectedIds([])
      setNotes('')
      setMessage(`${count} jamaah berhasil dipindahkan dari ${sourceClass?.name ?? 'kelas asal'} ke ${targetClass?.name ?? 'kelas tujuan'}.`)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Perubahan kelas gagal disimpan.')
    } finally {
      setSaving(false)
    }
  }

  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase()
    return [...classHistory]
      .filter((item) => {
        const person = personMap.get(item.jamaahId)
        const sourceName = item.fromClassId ? classMap.get(item.fromClassId) ?? '' : ''
        const targetName = item.toClassId ? classMap.get(item.toClassId) ?? '' : ''
        const matchesClass = historyClassId === 'all' || item.fromClassId === historyClassId || item.toClassId === historyClassId
        const matchesQuery = !query || [person?.fullName, sourceName, targetName, item.notes].join(' ').toLowerCase().includes(query)
        return matchesClass && matchesQuery
      })
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt))
  }, [classHistory, classMap, historyClassId, historySearch, personMap])

  const historyPagination = usePagination(filteredHistory, `${historySearch}|${historyClassId}`)

  function exportHistory() {
    downloadCsv('riwayat-kenaikan-dan-mutasi-kelas.csv', [
      ['Tanggal Efektif', 'Nama Jamaah', 'Jenis Perubahan', 'Kelas Asal', 'Kelas Tujuan', 'Kategori Sebelumnya', 'Kategori Baru', 'Catatan', 'Dicatat Pada'],
      ...filteredHistory.map((item) => [
        item.effectiveDate,
        personMap.get(item.jamaahId)?.fullName ?? 'Jamaah tidak ditemukan',
        changeTypeLabel(item.changeType),
        item.fromClassId ? classMap.get(item.fromClassId) ?? '-' : '-',
        item.toClassId ? classMap.get(item.toClassId) ?? '-' : '-',
        item.previousCensusCategory,
        item.newCensusCategory,
        item.notes,
        item.createdAt,
      ]),
    ])
  }

  return (
    <>
      <PageHeader
        title="Kenaikan & Mutasi Kelas"
        description="Pindahkan banyak jamaah sekaligus, pertahankan kelas tambahan, dan simpan histori perubahan secara permanen."
        actions={<button className="button outline" type="button" onClick={exportHistory}><Download size={16} /> Ekspor Riwayat</button>}
      />

      {message ? <div className="inline-message page-message">{message}</div> : null}

      <section className="progression-flow" aria-label="Alur kelas pembinaan">
        {Object.entries(CLASS_PROGRESSION).map(([source, destination]) => (
          <div className="progression-flow-item" key={source}>
            <span>{source}</span><ArrowRight size={14} /><strong>{destination}</strong>
          </div>
        ))}
      </section>

      <section className="stats-grid four-columns compact-stats progression-stats">
        <StatCard label="Anggota Kelas Asal" value={sourceMembers.length} note={sourceClass?.name ?? 'Pilih kelas'} icon={<UsersRound size={18} />} />
        <StatCard label="Jamaah Dipilih" value={selectedIds.length} note="Siap dipindahkan" icon={<CheckSquare2 size={18} />} />
        <StatCard label="Kelas Tujuan" value={targetClass?.name ?? '-'} note={recommendedTarget?.id === targetClassId ? 'Rekomendasi alur' : 'Pilihan manual'} icon={<Shuffle size={18} />} />
        <StatCard label="Kategori Baru" value={updateCensus ? targetCensusCategory ?? '-' : 'Tetap'} note={updateCensus ? 'Disesuaikan otomatis' : 'Tidak diubah'} icon={<Sparkles size={18} />} />
      </section>

      <article className="card progression-workspace">
        <div className="progression-settings">
          <label>Jenis perubahan
            <select value={changeType} onChange={(event) => setChangeType(event.target.value as ClassChangeType)}>
              <option value="promotion">Kenaikan kelas</option>
              <option value="transfer">Mutasi kelas</option>
              <option value="manual">Penyesuaian manual</option>
            </select>
          </label>
          <label>Kelas asal
            <select value={sourceClassId} onChange={(event) => setSourceClassId(event.target.value)}>
              {activeClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>Kelas tujuan
            <select value={targetClassId} onChange={(event) => setTargetClassId(event.target.value)}>
              {activeClasses.filter((item) => item.id !== sourceClassId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>Tanggal efektif
            <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
          </label>
        </div>

        <div className="progression-options">
          <label className={`switch-card ${updateCensus ? 'selected' : ''}`}>
            <input type="checkbox" checked={updateCensus} onChange={(event) => setUpdateCensus(event.target.checked)} />
            <span><strong>Sesuaikan kategori sensus</strong><small>Kategori utama mengikuti kelas tujuan. Kelas tambahan seperti Pengajian Umum dan 5 Unsur tetap dipertahankan.</small></span>
          </label>
          {recommendedTarget && targetClassId !== recommendedTarget.id ? (
            <button className="button soft small" type="button" onClick={() => setTargetClassId(recommendedTarget.id)}>
              <Sparkles size={14} /> Gunakan rekomendasi: {recommendedTarget.name}
            </button>
          ) : null}
        </div>

        {closed ? <div className="notice danger-notice">Tanggal efektif berada pada periode yang sudah ditutup. Buka kembali periode atau pilih tanggal lain.</div> : null}
        {sameClass ? <div className="notice danger-notice">Kelas asal dan kelas tujuan harus berbeda.</div> : null}

        <div className="toolbar progression-toolbar">
          <label className="search-field"><Search size={16} /><input placeholder="Cari jamaah pada kelas asal…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <button className="button outline small" type="button" onClick={toggleAllFiltered} disabled={!filteredMembers.length}>
            <CheckSquare2 size={15} /> {allFilteredSelected ? 'Batalkan pilihan tampil' : 'Pilih semua tampil'}
          </button>
        </div>

        <div className="table-wrap progression-member-table">
          <table>
            <thead><tr><th className="checkbox-column">Pilih</th><th>Jamaah</th><th>Kategori Saat Ini</th><th>Kelas Lain Tetap Dipertahankan</th><th>Rencana</th></tr></thead>
            <tbody>
              {filteredMembers.length ? memberPagination.pageItems.map((person) => {
                const otherClasses = person.classIds.filter((id) => id !== sourceClassId).map((id) => classMap.get(id) ?? 'Kelas')
                const nextCategory = targetClass ? censusCategoryForClassName(targetClass.name, person.censusCategory) : person.censusCategory
                return (
                  <tr className={selectedIds.includes(person.id) ? 'selected-row' : ''} key={person.id}>
                    <td><input className="row-checkbox" type="checkbox" checked={selectedIds.includes(person.id)} onChange={() => toggleMember(person.id)} aria-label={`Pilih ${person.fullName}`} /></td>
                    <td><Person name={person.fullName} meta={person.phone || 'Nomor belum diisi'} /></td>
                    <td><span className="badge info">{person.censusCategory}</span></td>
                    <td><div className="badge-list">{otherClasses.length ? otherClasses.map((name) => <span className="badge muted" key={name}>{name}</span>) : <span className="muted-copy">Tidak ada</span>}</div></td>
                    <td><div className="transition-preview"><span>{sourceClass?.name ?? '-'}</span><ArrowRight size={13} /><strong>{targetClass?.name ?? '-'}</strong>{updateCensus && nextCategory !== person.censusCategory ? <small>{person.censusCategory} → {nextCategory}</small> : null}</div></td>
                  </tr>
                )
              }) : <tr><td colSpan={5}><div className="empty-state">Belum ada jamaah aktif pada kelas asal ini.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={memberPagination.page} pageSize={memberPagination.pageSize} totalItems={filteredMembers.length} onPageChange={memberPagination.setPage} onPageSizeChange={memberPagination.setPageSize} />

        <div className="progression-submit-row">
          <label>Catatan perubahan (opsional)<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contoh: kenaikan kelas tahun ajaran 2026/2027" /></label>
          <button className="button primary" type="button" disabled={!selectedIds.length || !targetClassId || sameClass || closed} onClick={() => setConfirmOpen(true)}>
            <Shuffle size={16} /> Proses {selectedIds.length} Jamaah
          </button>
        </div>
      </article>

      <article className="card class-history-card">
        <div className="card-heading">
          <div><h2>Riwayat Kelas Jamaah</h2><p>Riwayat tidak mengubah absensi lama dan digunakan untuk mempertahankan konteks laporan historis.</p></div>
          <span className="badge muted"><History size={13} /> {filteredHistory.length} perubahan</span>
        </div>
        <div className="toolbar">
          <label className="search-field"><Search size={16} /><input placeholder="Cari jamaah, kelas, atau catatan…" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} /></label>
          <select value={historyClassId} onChange={(event) => setHistoryClassId(event.target.value)}>
            <option value="all">Semua kelas</option>
            {activeClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div className="table-wrap history-table">
          <table>
            <thead><tr><th>Tanggal Efektif</th><th>Jamaah</th><th>Perubahan Kelas</th><th>Perubahan Kategori</th><th>Jenis</th><th>Catatan</th></tr></thead>
            <tbody>
              {filteredHistory.length ? historyPagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td><strong>{formatDate(item.effectiveDate)}</strong><small className="table-subtext">Dicatat {formatDateTime(item.createdAt)}</small></td>
                  <td><Person name={personMap.get(item.jamaahId)?.fullName ?? 'Jamaah tidak ditemukan'} meta={personMap.get(item.jamaahId)?.phone || 'Data jamaah'} /></td>
                  <td><div className="transition-preview compact"><span>{item.fromClassId ? classMap.get(item.fromClassId) ?? '-' : '-'}</span><ArrowRight size={13} /><strong>{item.toClassId ? classMap.get(item.toClassId) ?? '-' : '-'}</strong></div></td>
                  <td>{item.previousCensusCategory === item.newCensusCategory ? <span className="badge muted">Tetap {item.newCensusCategory}</span> : <span className="badge info">{item.previousCensusCategory} → {item.newCensusCategory}</span>}</td>
                  <td><span className="badge success">{changeTypeLabel(item.changeType)}</span></td>
                  <td>{item.notes || <span className="muted-copy">—</span>}</td>
                </tr>
              )) : <tr><td colSpan={6}><div className="empty-state">Belum ada riwayat kenaikan atau mutasi kelas.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={historyPagination.page} pageSize={historyPagination.pageSize} totalItems={filteredHistory.length} onPageChange={historyPagination.setPage} onPageSizeChange={historyPagination.setPageSize} />
      </article>

      <Modal
        open={confirmOpen}
        title="Konfirmasi Perubahan Kelas"
        onClose={() => !saving && setConfirmOpen(false)}
        footer={<><button className="button outline" disabled={saving} onClick={() => setConfirmOpen(false)}>Batal</button><button className="button primary" disabled={saving} onClick={() => void submitTransition()}>{saving ? 'Memproses…' : `Konfirmasi ${selectedIds.length} Jamaah`}</button></>}
      >
        <div className="transition-confirmation">
          <span className="transition-confirmation-icon"><Shuffle size={22} /></span>
          <div>
            <strong>{changeTypeLabel(changeType)} untuk {selectedIds.length} jamaah</strong>
            <p>{sourceClass?.name ?? '-'} <ArrowRight size={13} /> {targetClass?.name ?? '-'}</p>
          </div>
        </div>
        <div className="confirmation-list">
          <span><small>Tanggal efektif</small><strong>{effectiveDate ? formatDate(effectiveDate) : '-'}</strong></span>
          <span><small>Kategori sensus</small><strong>{updateCensus ? 'Disesuaikan otomatis' : 'Tetap seperti sekarang'}</strong></span>
          <span><small>Kelas tambahan</small><strong>Tetap dipertahankan</strong></span>
        </div>
        <p className="modal-help">Perubahan akan dicatat pada histori. Absensi dan laporan sesi yang sudah tersimpan tidak dihapus.</p>
      </Modal>
    </>
  )
}
