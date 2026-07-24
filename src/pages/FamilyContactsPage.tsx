import {
  ExternalLink,
  House,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { PageHeader, Person, StatCard } from '../components/UI'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { usePagination } from '../hooks/usePagination'
import { preferredContactForJamaah } from '../lib/contacts'
import { normalizeWhatsappNumber } from '../lib/followUps'
import { ageFromBirthDate, formatDate } from '../lib/utils'
import type {
  Family,
  FamilyMember,
  FamilyRelationship,
  GuardianContact,
  GuardianRelationship,
  Jamaah,
} from '../types/domain'

const FAMILY_RELATIONSHIPS: FamilyRelationship[] = ['Kepala Keluarga', 'Pasangan', 'Anak', 'Orang Tua', 'Saudara', 'Lainnya']
const GUARDIAN_RELATIONSHIPS: GuardianRelationship[] = ['Ayah', 'Ibu', 'Wali', 'Suami', 'Istri', 'Anak', 'Saudara', 'Lainnya']

interface MemberDraft {
  jamaahId: string
  relationship: FamilyRelationship
  isPrimaryContact: boolean
}

const EMPTY_FAMILY: Family = {
  id: '',
  name: '',
  address: '',
  notes: '',
  createdAt: '',
  updatedAt: '',
}

const EMPTY_GUARDIAN: GuardianContact = {
  id: '',
  jamaahId: '',
  fullName: '',
  relationship: 'Ayah',
  phone: '',
  isPrimary: true,
  notes: '',
  createdAt: '',
  updatedAt: '',
}

export function FamilyContactsPage() {
  const { user } = useAuth()
  const {
    classes,
    jamaah,
    visibleJamaah,
    families,
    familyMembers,
    guardianContacts,
    saveFamily,
    deleteFamily,
    saveGuardianContact,
    deleteGuardianContact,
  } = useData()
  const canManage = user?.role === 'superadmin'
  const [search, setSearch] = useState('')
  const [familyOpen, setFamilyOpen] = useState(false)
  const [familyForm, setFamilyForm] = useState<Family>(EMPTY_FAMILY)
  const [memberDrafts, setMemberDrafts] = useState<MemberDraft[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [guardianOpen, setGuardianOpen] = useState(false)
  const [guardianForm, setGuardianForm] = useState<GuardianContact>(EMPTY_GUARDIAN)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  const pageJamaah = useMemo(() => canManage ? jamaah : visibleJamaah, [canManage, jamaah, visibleJamaah])
  const visibleIds = useMemo(() => new Set(pageJamaah.map((item) => item.id)), [pageJamaah])
  const jamaahMap = useMemo(() => new Map(jamaah.map((item) => [item.id, item])), [jamaah])
  const familyMap = useMemo(() => new Map(families.map((item) => [item.id, item])), [families])
  const membershipByJamaah = useMemo(() => new Map(familyMembers.map((item) => [item.jamaahId, item])), [familyMembers])

  const accessibleFamilies = useMemo(() => families.filter((family) => {
    const members = familyMembers.filter((item) => item.familyId === family.id)
    return canManage || members.some((item) => visibleIds.has(item.jamaahId))
  }), [canManage, families, familyMembers, visibleIds])

  const visibleFamilies = useMemo(() => {
    const query = search.trim().toLowerCase()
    return accessibleFamilies.filter((family) => {
      const members = familyMembers.filter((item) => item.familyId === family.id)
      const memberNames = members.map((item) => jamaahMap.get(item.jamaahId)?.fullName ?? '').join(' ')
      return !query || [family.name, family.address, memberNames].join(' ').toLowerCase().includes(query)
    })
  }, [accessibleFamilies, familyMembers, jamaahMap, search])

  const contactRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return pageJamaah
      .filter((item) => !query || [item.fullName, item.phone, item.censusCategory].join(' ').toLowerCase().includes(query))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'))
  }, [pageJamaah, search])

  const contactPagination = usePagination(contactRows, search)

  const visibleContacts = guardianContacts.filter((item) => visibleIds.has(item.jamaahId))
  const linkedJamaahCount = new Set(familyMembers.filter((item) => canManage || visibleIds.has(item.jamaahId)).map((item) => item.jamaahId)).size
  const withoutContact = pageJamaah.filter((item) => !preferredContactForJamaah(item, guardianContacts)).length

  function openCreateFamily() {
    const now = new Date().toISOString()
    setFamilyForm({ ...EMPTY_FAMILY, id: `new-${crypto.randomUUID()}`, createdAt: now, updatedAt: now })
    setMemberDrafts([])
    setMemberSearch('')
    setModalError(null)
    setFamilyOpen(true)
  }

  function openEditFamily(family: Family) {
    setFamilyForm({ ...family })
    setMemberDrafts(familyMembers.filter((item) => item.familyId === family.id).map((item) => ({
      jamaahId: item.jamaahId,
      relationship: item.relationship,
      isPrimaryContact: item.isPrimaryContact,
    })))
    setMemberSearch('')
    setModalError(null)
    setFamilyOpen(true)
  }

  function toggleMember(person: Jamaah) {
    setMemberDrafts((current) => {
      if (current.some((item) => item.jamaahId === person.id)) return current.filter((item) => item.jamaahId !== person.id)
      return [...current, { jamaahId: person.id, relationship: 'Anak', isPrimaryContact: false }]
    })
  }

  function updateMember(jamaahId: string, changes: Partial<MemberDraft>) {
    setMemberDrafts((current) => current.map((item) => {
      if (item.jamaahId !== jamaahId) {
        return changes.isPrimaryContact ? { ...item, isPrimaryContact: false } : item
      }
      return { ...item, ...changes }
    }))
  }

  async function submitFamily() {
    setSaving(true)
    setModalError(null)
    try {
      await saveFamily({
        family: { ...familyForm, name: familyForm.name.trim(), address: familyForm.address.trim(), notes: familyForm.notes.trim(), updatedAt: new Date().toISOString() },
        members: memberDrafts.map<FamilyMember>((item) => ({ ...item, familyId: familyForm.id })),
      })
      setFamilyOpen(false)
      setMessage('Data keluarga berhasil disimpan.')
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : 'Gagal menyimpan data keluarga.')
    } finally {
      setSaving(false)
    }
  }

  async function removeSelectedFamily(family: Family) {
    if (!window.confirm(`Hapus data ${family.name}? Keanggotaan keluarga akan dilepas, tetapi data warga tetap tersimpan.`)) return
    try {
      await deleteFamily(family.id)
      setMessage('Data keluarga berhasil dihapus.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Gagal menghapus data keluarga.')
    }
  }

  function openCreateGuardian(person?: Jamaah) {
    const now = new Date().toISOString()
    setGuardianForm({ ...EMPTY_GUARDIAN, id: `new-${crypto.randomUUID()}`, jamaahId: person?.id ?? pageJamaah[0]?.id ?? '', createdAt: now, updatedAt: now })
    setModalError(null)
    setGuardianOpen(true)
  }

  function openEditGuardian(contact: GuardianContact) {
    setGuardianForm({ ...contact })
    setModalError(null)
    setGuardianOpen(true)
  }

  async function submitGuardian() {
    setSaving(true)
    setModalError(null)
    try {
      await saveGuardianContact({ ...guardianForm, fullName: guardianForm.fullName.trim(), phone: guardianForm.phone.trim(), notes: guardianForm.notes.trim(), updatedAt: new Date().toISOString() })
      setGuardianOpen(false)
      setMessage('Kontak wali berhasil disimpan.')
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : 'Gagal menyimpan kontak wali.')
    } finally {
      setSaving(false)
    }
  }

  async function removeSelectedGuardian(contact: GuardianContact) {
    if (!window.confirm(`Hapus kontak ${contact.fullName}?`)) return
    try {
      await deleteGuardianContact(contact.id)
      setMessage('Kontak wali berhasil dihapus.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Gagal menghapus kontak wali.')
    }
  }

  const memberCandidates = jamaah
    .filter((item) => !memberSearch || item.fullName.toLowerCase().includes(memberSearch.toLowerCase()))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'))

  return (
    <>
      <PageHeader
        title="Keluarga & Kontak Wali"
        description={canManage ? 'Kelompokkan warga dalam satu keluarga dan simpan nomor wali yang dapat dihubungi saat tindak lanjut absensi.' : 'Daftar lengkap warga aktif, keluarga, dan wali dari kelas yang Anda ampu.'}
        actions={canManage ? <><button className="button outline" onClick={() => openCreateGuardian()}><UserRound size={16} /> Tambah Kontak Wali</button><button className="button primary" onClick={openCreateFamily}><Plus size={16} /> Tambah Keluarga</button></> : undefined}
      />

      <section className="stats-grid four-columns compact-stats">
        <StatCard label="Keluarga Tercatat" value={accessibleFamilies.length} note="Kelompok keluarga yang dapat dilihat" icon={<House size={20} />} />
        <StatCard label="Warga Terhubung" value={linkedJamaahCount} note="Memiliki data keluarga" icon={<UsersRound size={20} />} />
        <StatCard label="Kontak Wali" value={visibleContacts.length} note="Nomor wali tersimpan" icon={<UserRound size={20} />} />
        <StatCard label="Tanpa Kontak" value={withoutContact} note="Tidak memiliki nomor sendiri/wali" icon={<span>!</span>} />
      </section>

      {message ? <div className={`inline-message page-message ${message.startsWith('Gagal') ? 'error' : ''}`}>{message}</div> : null}

      <label className="search-field family-global-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari keluarga, warga, atau nomor kontak…" /></label>

      <article className="card family-section">
        <div className="card-heading"><div><h2>Daftar Keluarga</h2><p>Satu warga hanya dapat terhubung ke satu keluarga, tetapi dapat memiliki beberapa kontak wali.</p></div></div>
        <div className="family-card-grid">
          {visibleFamilies.map((family) => {
            const members = familyMembers.filter((item) => item.familyId === family.id && (canManage || visibleIds.has(item.jamaahId)))
            return (
              <section className="family-card" key={family.id}>
                <header>
                  <span className="family-icon"><House size={18} /></span>
                  <div><strong>{family.name}</strong><small>{family.address || 'Alamat belum diisi'}</small></div>
                  {canManage ? <div className="family-card-actions"><button className="icon-button" onClick={() => openEditFamily(family)} aria-label="Edit keluarga"><Pencil size={15} /></button><button className="icon-button danger-icon" onClick={() => void removeSelectedFamily(family)} aria-label="Hapus keluarga"><Trash2 size={15} /></button></div> : null}
                </header>
                <div className="family-members">
                  {members.map((member) => {
                    const person = jamaahMap.get(member.jamaahId)
                    return person ? <div key={member.jamaahId}><Person name={person.fullName} meta={`${member.relationship} · ${person.censusCategory}`} />{member.isPrimaryContact ? <span className="badge info">Kontak keluarga</span> : null}</div> : null
                  })}
                  {!members.length ? <div className="empty-state">Tidak ada anggota yang dapat dilihat.</div> : null}
                </div>
                {family.notes ? <p className="family-notes">{family.notes}</p> : null}
              </section>
            )
          })}
          {!visibleFamilies.length ? <div className="empty-state family-empty">Belum ada data keluarga yang sesuai pencarian.</div> : null}
        </div>
      </article>

      <article className="card family-section">
        <div className="card-heading"><div><h2>Data Warga dan Wali</h2><p>Profil dan kelas warga ditampilkan bersama kontaknya. Nomor warga diprioritaskan; jika kosong, sistem menggunakan kontak wali utama.</p></div></div>
        <div className="table-wrap guardian-table">
          <table>
            <thead><tr><th>Warga</th><th>Profil & Kelas</th><th>Keluarga</th><th>Kontak Utama</th><th>Kontak Lain</th><th>Aksi</th></tr></thead>
            <tbody>
              {contactPagination.pageItems.map((person) => {
                const membership = membershipByJamaah.get(person.id)
                const family = membership ? familyMap.get(membership.familyId) : null
                const contacts = guardianContacts.filter((item) => item.jamaahId === person.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
                const preferred = preferredContactForJamaah(person, guardianContacts)
                const waNumber = preferred ? normalizeWhatsappNumber(preferred.phone) : ''
                const age = ageFromBirthDate(person.birthDate)
                const classNames = person.classIds.map((id) => classes.find((item) => item.id === id)?.name).filter(Boolean)
                return (
                  <tr key={person.id}>
                    <td><Person name={person.fullName} meta={`${person.gender} · ${person.censusCategory}`} />{!person.active ? <span className="badge danger">Nonaktif</span> : null}</td>
                    <td><div className="badge-list">{classNames.map((name) => <span className="badge muted" key={name}>{name}</span>)}</div><div className="table-subtle">{person.birthDate ? `${formatDate(person.birthDate)} · ${age} tahun` : 'Tanggal lahir belum diisi'}</div><div className="table-subtle">{person.phone || 'Nomor pribadi belum diisi'}</div></td>
                    <td>{family ? <><strong>{family.name}</strong><div className="table-subtle">{membership?.relationship}</div></> : <span className="muted-copy">Belum terhubung</span>}</td>
                    <td>{preferred ? <><strong>{preferred.name}</strong><div className="table-subtle">{preferred.relationship} · {preferred.phone}</div></> : <span className="badge warning">Belum ada kontak</span>}</td>
                    <td><div className="guardian-contact-list">{contacts.map((contact) => <button className="guardian-contact-chip" key={contact.id} type="button" onClick={() => canManage && openEditGuardian(contact)} disabled={!canManage}><span>{contact.fullName}</span><small>{contact.relationship}{contact.isPrimary ? ' · Utama' : ''}</small></button>)}{!contacts.length ? <span className="muted-copy">—</span> : null}</div></td>
                    <td><div className="button-row compact-actions">{waNumber ? <a className="button outline small" href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp <ExternalLink size={11} /></a> : null}{canManage ? <button className="button soft small" onClick={() => openCreateGuardian(person)}><Plus size={14} /> Wali</button> : null}</div></td>
                  </tr>
                )
              })}
              {!contactRows.length ? <tr><td colSpan={6}><div className="empty-state">Tidak ada warga yang sesuai pencarian.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
        <Pagination page={contactPagination.page} pageSize={contactPagination.pageSize} totalItems={contactRows.length} onPageChange={contactPagination.setPage} onPageSizeChange={contactPagination.setPageSize} />
      </article>

      <Modal
        open={familyOpen}
        title={families.some((item) => item.id === familyForm.id) ? 'Edit Data Keluarga' : 'Tambah Data Keluarga'}
        onClose={() => !saving && setFamilyOpen(false)}
        wide
        footer={<><button className="button outline" disabled={saving} onClick={() => setFamilyOpen(false)}>Batal</button><button className="button primary" disabled={saving} onClick={() => void submitFamily()}>{saving ? 'Menyimpan…' : 'Simpan Keluarga'}</button></>}
      >
        <div className="form-grid">
          <label>Nama keluarga *<input value={familyForm.name} onChange={(event) => setFamilyForm({ ...familyForm, name: event.target.value })} placeholder="Contoh: Keluarga Bapak Ahmad" /></label>
          <label>Alamat<input value={familyForm.address} onChange={(event) => setFamilyForm({ ...familyForm, address: event.target.value })} placeholder="Alamat keluarga" /></label>
          <label className="form-span-two">Catatan<textarea rows={3} value={familyForm.notes} onChange={(event) => setFamilyForm({ ...familyForm, notes: event.target.value })} placeholder="Catatan tambahan yang perlu diketahui pengurus" /></label>
        </div>
        <div className="family-member-heading"><div><strong>Anggota keluarga</strong><small>{memberDrafts.length} warga dipilih</small></div><label className="search-field"><Search size={15} /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Cari warga…" /></label></div>
        <div className="family-member-picker">
          {memberCandidates.map((person) => {
            const selected = memberDrafts.find((item) => item.jamaahId === person.id)
            const existing = membershipByJamaah.get(person.id)
            const belongsElsewhere = Boolean(existing && existing.familyId !== familyForm.id)
            const existingFamily = belongsElsewhere ? familyMap.get(existing!.familyId) : null
            return (
              <div className={`family-member-row ${selected ? 'selected' : ''} ${belongsElsewhere ? 'disabled' : ''}`} key={person.id}>
                <label><input type="checkbox" checked={Boolean(selected)} disabled={belongsElsewhere} onChange={() => toggleMember(person)} /><Person name={person.fullName} meta={belongsElsewhere ? `Sudah di ${existingFamily?.name ?? 'keluarga lain'}` : `${person.censusCategory}${person.active ? '' : ' · Nonaktif'}`} /></label>
                {selected ? <><select value={selected.relationship} onChange={(event) => updateMember(person.id, { relationship: event.target.value as FamilyRelationship })}>{FAMILY_RELATIONSHIPS.map((item) => <option key={item}>{item}</option>)}</select><label className="primary-family-contact"><input type="radio" name="family-primary" checked={selected.isPrimaryContact} onChange={() => updateMember(person.id, { isPrimaryContact: true })} /> Kontak utama</label></> : null}
              </div>
            )
          })}
        </div>
        {modalError ? <div className="form-error">{modalError}</div> : null}
      </Modal>

      <Modal
        open={guardianOpen}
        title={guardianContacts.some((item) => item.id === guardianForm.id) ? 'Edit Kontak Wali' : 'Tambah Kontak Wali'}
        onClose={() => !saving && setGuardianOpen(false)}
        footer={<><button className="button outline" disabled={saving} onClick={() => setGuardianOpen(false)}>Batal</button><button className="button primary" disabled={saving} onClick={() => void submitGuardian()}>{saving ? 'Menyimpan…' : 'Simpan Kontak'}</button></>}
      >
        <div className="form-grid one-column">
          <label>Warga *<select value={guardianForm.jamaahId} onChange={(event) => setGuardianForm({ ...guardianForm, jamaahId: event.target.value })}>{[...jamaah].sort((a, b) => a.fullName.localeCompare(b.fullName, 'id')).map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.censusCategory}{item.active ? '' : ' · Nonaktif'}</option>)}</select></label>
          <label>Nama kontak *<input value={guardianForm.fullName} onChange={(event) => setGuardianForm({ ...guardianForm, fullName: event.target.value })} placeholder="Nama orang tua atau wali" /></label>
          <label>Hubungan<select value={guardianForm.relationship} onChange={(event) => setGuardianForm({ ...guardianForm, relationship: event.target.value as GuardianRelationship })}>{GUARDIAN_RELATIONSHIPS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Nomor WhatsApp *<input inputMode="tel" value={guardianForm.phone} onChange={(event) => setGuardianForm({ ...guardianForm, phone: event.target.value })} placeholder="08xxxxxxxxxx" /></label>
          <label className="simple-checkbox"><input type="checkbox" checked={guardianForm.isPrimary} onChange={(event) => setGuardianForm({ ...guardianForm, isPrimary: event.target.checked })} /> Jadikan kontak utama untuk warga ini</label>
          <label>Catatan<textarea rows={3} value={guardianForm.notes} onChange={(event) => setGuardianForm({ ...guardianForm, notes: event.target.value })} placeholder="Contoh: dapat dihubungi setelah pukul 17.00" /></label>
        </div>
        {guardianContacts.some((item) => item.id === guardianForm.id) ? <button className="button danger guardian-delete" disabled={saving} onClick={() => { const contact = guardianContacts.find((item) => item.id === guardianForm.id); if (contact) { setGuardianOpen(false); void removeSelectedGuardian(contact) } }}><Trash2 size={15} /> Hapus Kontak</button> : null}
        {modalError ? <div className="form-error">{modalError}</div> : null}
      </Modal>
    </>
  )
}
