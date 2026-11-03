import { GitMerge } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { PageHeader, Person } from '../components/UI'
import { useData } from '../contexts/DataContext'
import { usePagination } from '../hooks/usePagination'
import { CENSUS_CATEGORIES } from '../lib/constants'
import { findDuplicateCandidates, type DuplicateCandidate } from '../lib/duplicates'
import { ageFromBirthDate, formatDateTime } from '../lib/utils'
import type { Jamaah } from '../types/domain'

type MergeProfile = Pick<Jamaah, 'fullName' | 'gender' | 'birthDate' | 'phone' | 'censusCategory' | 'active'>

function personMeta(person: Jamaah): string {
  const age = ageFromBirthDate(person.birthDate)
  return `${person.censusCategory} · ${age === null ? 'Usia belum diisi' : `${age} tahun`}`
}

function profileFrom(person: Jamaah, other?: Jamaah): MergeProfile {
  return {
    fullName: person.fullName,
    gender: person.gender,
    birthDate: person.birthDate || other?.birthDate || '',
    phone: person.phone || other?.phone || '',
    censusCategory: person.censusCategory,
    active: person.active || Boolean(other?.active),
  }
}

export function DuplicatesPage() {
  const {
    classNameMap,
    jamaah, guardianContacts, attendanceSessions, materialCompletions, followUps,
    classHistory, statusHistory, familyMembers, mergeHistory, mergeDuplicateJamaah,
  } = useData()
  const [duplicateDetail, setDuplicateDetail] = useState<DuplicateCandidate | null>(null)
  const [primaryId, setPrimaryId] = useState('')
  const [mergeProfile, setMergeProfile] = useState<MergeProfile | null>(null)
  const [mergeConfirmed, setMergeConfirmed] = useState(false)
  const [savingMerge, setSavingMerge] = useState(false)
  const [mergeMessage, setMergeMessage] = useState('')

  const duplicates = useMemo(() => findDuplicateCandidates(jamaah), [jamaah])
  const peopleById = useMemo(() => new Map(jamaah.map((person) => [person.id, person])), [jamaah])
  const duplicatePagination = usePagination(duplicates, String(duplicates.length))
  const historyPagination = usePagination(mergeHistory, String(mergeHistory.length))
  const selectedPeople = duplicateDetail
    ? [peopleById.get(duplicateDetail.firstJamaahId), peopleById.get(duplicateDetail.secondJamaahId)].filter(Boolean) as Jamaah[]
    : []
  const primaryPerson = selectedPeople.find((person) => person.id === primaryId) ?? null
  const duplicatePerson = selectedPeople.find((person) => person.id !== primaryId) ?? null

  useEffect(() => {
    if (!duplicateDetail) {
      setPrimaryId('')
      setMergeProfile(null)
      setMergeConfirmed(false)
      setMergeMessage('')
      return
    }
    const first = peopleById.get(duplicateDetail.firstJamaahId)
    if (!first) return
    const second = peopleById.get(duplicateDetail.secondJamaahId)
    setPrimaryId(first.id)
    setMergeProfile(profileFrom(first, second))
    setMergeConfirmed(false)
    setMergeMessage('')
  }, [duplicateDetail, peopleById])

  const selectPrimary = (person: Jamaah) => {
    const other = selectedPeople.find((item) => item.id !== person.id)
    setPrimaryId(person.id)
    setMergeProfile(profileFrom(person, other))
    setMergeConfirmed(false)
    setMergeMessage('')
  }

  const relatedCounts = (personId: string) => ({
    attendance: attendanceSessions.filter((session) => personId in session.statuses).length,
    materials: materialCompletions.filter((item) => item.jamaahId === personId).length,
    followUps: followUps.filter((item) => item.jamaahId === personId).length,
    guardians: guardianContacts.filter((item) => item.jamaahId === personId).length,
    histories: classHistory.filter((item) => item.jamaahId === personId).length + statusHistory.filter((item) => item.jamaahId === personId).length,
    family: familyMembers.find((item) => item.jamaahId === personId)?.familyId ?? '',
  })

  const submitMerge = async () => {
    if (!primaryPerson || !duplicatePerson || !mergeProfile || !mergeConfirmed) return
    setSavingMerge(true)
    setMergeMessage('')
    try {
      await mergeDuplicateJamaah({
        primaryJamaahId: primaryPerson.id,
        duplicateJamaahId: duplicatePerson.id,
        mergedProfile: { ...mergeProfile, fullName: mergeProfile.fullName.trim(), phone: mergeProfile.phone.trim() },
      })
      setDuplicateDetail(null)
    } catch (cause) {
      setMergeMessage(cause instanceof Error ? cause.message : 'Penggabungan data gagal.')
    } finally {
      setSavingMerge(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Data Duplikat"
        description="Mencari warga yang kemungkinan tercatat dua kali, lalu menggabungkannya menjadi satu data beserta seluruh relasinya."
      />

      <article className="card">
        <div className="card-heading"><div><h2>Potensi Data Duplikat</h2><p>Bandingkan, pilih data utama, lalu gabungkan seluruh relasi dalam satu transaksi.</p></div></div>
        <div className="duplicate-list">
          {duplicatePagination.pageItems.map((candidate) => {
            const first = peopleById.get(candidate.firstJamaahId)
            const second = peopleById.get(candidate.secondJamaahId)
            if (!first || !second) return null
            return <div className="duplicate-row" key={candidate.id}>
              <div className="duplicate-people"><Person name={first.fullName} meta={personMeta(first)} /><span>dibandingkan dengan</span><Person name={second.fullName} meta={personMeta(second)} /></div>
              <div className="badge-list">{candidate.reasons.map((reason) => <span className="badge muted" key={reason}>{reason}</span>)}</div>
              <span className={`badge ${candidate.score >= 90 ? 'danger' : 'warning'}`}>{candidate.score}% mirip</span>
              <button className="button outline small" type="button" onClick={() => setDuplicateDetail(candidate)}>Tinjau & gabungkan</button>
            </div>
          })}
          {!duplicates.length ? <div className="empty-state">Tidak ditemukan kandidat duplikat.</div> : null}
        </div>
        <Pagination page={duplicatePagination.page} pageSize={duplicatePagination.pageSize} totalItems={duplicates.length} onPageChange={duplicatePagination.setPage} onPageSizeChange={duplicatePagination.setPageSize} />
      </article>

      <article className="card">
        <div className="card-heading"><div><h2>Riwayat Penggabungan</h2><p>Jejak data duplikat yang sudah disatukan. Snapshot data lama tetap tersimpan di database.</p></div></div>
        <div className="merge-history-list">
          {historyPagination.pageItems.map((item) => (
            <div className="merge-history-row" key={item.id}>
              <GitMerge size={18} />
              <div><strong>{item.duplicateName} → {String(item.mergedProfile.fullName ?? item.primaryName)}</strong><span>{formatDateTime(item.mergedAt)} · {Object.values(item.movedCounts).reduce((total, count) => total + Number(count || 0), 0)} relasi dipindahkan</span></div>
              {item.familyConflict ? <span className="badge warning">Konflik keluarga dicatat</span> : <span className="badge success">Selesai</span>}
            </div>
          ))}
          {!mergeHistory.length ? <div className="empty-state">Belum ada data yang digabung.</div> : null}
        </div>
        <Pagination page={historyPagination.page} pageSize={historyPagination.pageSize} totalItems={mergeHistory.length} onPageChange={historyPagination.setPage} onPageSizeChange={historyPagination.setPageSize} />
      </article>

      <Modal
        open={Boolean(duplicateDetail)}
        title="Tinjau dan Gabungkan Data Duplikat"
        onClose={() => !savingMerge && setDuplicateDetail(null)}
        wide
        footer={<>
          <button className="button outline" disabled={savingMerge} onClick={() => setDuplicateDetail(null)}>Batal</button>
          <button className="button primary" disabled={!mergeConfirmed || savingMerge || !mergeProfile?.fullName.trim()} onClick={() => void submitMerge()}><GitMerge size={16} /> {savingMerge ? 'Menggabungkan…' : 'Gabungkan Data'}</button>
        </>}
      >
        <div className="notice warning-notice"><strong>Proses ini tidak dapat dibatalkan dari aplikasi.</strong> Data duplikat akan dihapus setelah kelas, absensi, materi, tindak lanjut, wali, dan histori dipindahkan ke data utama. Snapshot lengkap tetap disimpan di Riwayat Penggabungan.</div>

        <div className="duplicate-comparison-grid merge-selection-grid">
          {selectedPeople.map((person) => {
            const counts = relatedCounts(person.id)
            const selected = person.id === primaryId
            return <article className={selected ? 'selected-primary' : ''} key={person.id}>
              <label className="primary-choice"><input type="radio" name="primaryJamaah" checked={selected} onChange={() => selectPrimary(person)} /><span>Jadikan data utama</span></label>
              <Person name={person.fullName} meta={personMeta(person)} />
              <dl>
                <div><dt>Jenis kelamin</dt><dd>{person.gender}</dd></div>
                <div><dt>Tanggal lahir</dt><dd>{person.birthDate || 'Belum diisi'}</dd></div>
                <div><dt>WhatsApp</dt><dd>{person.phone || 'Belum diisi'}</dd></div>
                <div><dt>Status</dt><dd>{person.active ? 'Aktif' : 'Nonaktif'}</dd></div>
                <div><dt>Kelas</dt><dd>{person.classIds.map((id) => classNameMap.get(id)).filter(Boolean).join(', ') || 'Belum ada'}</dd></div>
              </dl>
              <div className="merge-related-counts">
                <span>{counts.attendance} sesi</span><span>{counts.materials} materi</span><span>{counts.followUps} tindak lanjut</span><span>{counts.guardians} wali</span><span>{counts.histories} histori</span>
              </div>
              <Link className="button outline full" to={`/sensus?edit=${person.id}`} onClick={() => setDuplicateDetail(null)}>Buka data ini</Link>
            </article>
          })}
        </div>

        {mergeProfile && primaryPerson && duplicatePerson ? <>
          <section className="merge-result-section">
            <div className="card-heading"><div><h3>Data akhir yang akan dipertahankan</h3><p>Field dapat diperbaiki sebelum penggabungan. Semua kelas dari kedua data otomatis disatukan.</p></div></div>
            <div className="form-grid merge-profile-grid">
              <label className="field"><span>Nama lengkap</span><input value={mergeProfile.fullName} onChange={(event) => setMergeProfile({ ...mergeProfile, fullName: event.target.value })} /></label>
              <label className="field"><span>Jenis kelamin</span><select value={mergeProfile.gender} onChange={(event) => setMergeProfile({ ...mergeProfile, gender: event.target.value as Jamaah['gender'] })}><option>Laki-laki</option><option>Perempuan</option></select></label>
              <label className="field"><span>Tanggal lahir (opsional)</span><input type="date" value={mergeProfile.birthDate} onChange={(event) => setMergeProfile({ ...mergeProfile, birthDate: event.target.value })} /></label>
              <label className="field"><span>Nomor WhatsApp</span><input value={mergeProfile.phone} onChange={(event) => setMergeProfile({ ...mergeProfile, phone: event.target.value })} /></label>
              <label className="field"><span>Kategori sensus</span><select value={mergeProfile.censusCategory} onChange={(event) => setMergeProfile({ ...mergeProfile, censusCategory: event.target.value as Jamaah['censusCategory'] })}>{CENSUS_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="field"><span>Status warga</span><select value={String(mergeProfile.active)} disabled><option value="true">Aktif</option><option value="false">Nonaktif</option></select><small>Status aktif dipertahankan bila salah satu data masih aktif.</small></label>
            </div>
            <div className="merge-union-note"><strong>Kelas hasil gabungan:</strong> {[...new Set([...primaryPerson.classIds, ...duplicatePerson.classIds])].map((id) => classNameMap.get(id)).filter(Boolean).join(', ') || 'Belum ada kelas'}</div>
            {relatedCounts(primaryPerson.id).family && relatedCounts(duplicatePerson.id).family && relatedCounts(primaryPerson.id).family !== relatedCounts(duplicatePerson.id).family
              ? <div className="notice warning-notice">Kedua data berada pada keluarga berbeda. Keluarga milik data utama akan dipertahankan dan konflik dicatat dalam riwayat penggabungan.</div> : null}
          </section>
          <label className="merge-confirmation"><input type="checkbox" checked={mergeConfirmed} onChange={(event) => setMergeConfirmed(event.target.checked)} /><span>Saya sudah memeriksa data utama dan memahami bahwa data <strong>{duplicatePerson.fullName}</strong> akan dihapus setelah seluruh relasinya dipindahkan.</span></label>
          {mergeMessage ? <div className="notice danger-notice">{mergeMessage}</div> : null}
        </> : null}
      </Modal>
    </>
  )
}
