import {
  CalendarCog,
  Copy,
  ExternalLink,
  House,
  KeyRound,
  Link2,
  Link2Off,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { useConfirm } from '../components/useConfirm'
import { Pagination } from '../components/Pagination'
import { EmptyState, InlineMessage, PageHeader, Person, StatCard } from '../components/UI'
import { MonthField } from '../components/MonthField'
import { feedbackError, feedbackFrom, feedbackInfo, feedbackOk, type Feedback } from '../lib/feedback'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { usePagination } from '../hooks/usePagination'
import { preferredContactForJamaah } from '../lib/contacts'
import { normalizeWhatsappNumber } from '../lib/followUps'
import { buildWaliInviteMessage, buildWaliLink, waliRangeLabel, waliWindowRange, WALI_WINDOW_DEFAULT, WALI_WINDOW_OPTIONS, type WaliWindow } from '../lib/wali'
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
  guardianJamaahId: null,
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
    waliAccess,
    setWaliAccess,
    setWaliWindow,
  } = useData()
  const canManage = user?.role === 'superadmin'
  const [search, setSearch] = useState('')
  const [familyOpen, setFamilyOpen] = useState(false)
  const [familyForm, setFamilyForm] = useState<Family>(EMPTY_FAMILY)
  const [memberDrafts, setMemberDrafts] = useState<MemberDraft[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [guardianOpen, setGuardianOpen] = useState(false)
  const [guardianForm, setGuardianForm] = useState<GuardianContact>(EMPTY_GUARDIAN)
  const [guardianSearch, setGuardianSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<Feedback | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [detailFamily, setDetailFamily] = useState<Family | null>(null)
  const [detailPerson, setDetailPerson] = useState<Jamaah | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [waliShare, setWaliShare] = useState<{ jamaahId: string; waliName: string; link: string; waUrl: string } | null>(null)
  const [windowDraft, setWindowDraft] = useState<WaliWindow>(WALI_WINDOW_DEFAULT)
  const [windowMessage, setWindowMessage] = useState<Feedback | null>(null)
  const windowRange = waliWindowRange(windowDraft)
  const windowPreview = waliRangeLabel(windowRange.since, windowRange.until)

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
  const familyPagination = usePagination(visibleFamilies, search)

  /** Anggota yang boleh dilihat pengguna ini. Dipakai bersama tabel ringkas dan modal detail. */
  const membersOfFamily = (familyId: string) => familyMembers
    .filter((item) => item.familyId === familyId && (canManage || visibleIds.has(item.jamaahId)))
    .map((item) => ({ member: item, person: jamaahMap.get(item.jamaahId) }))
    .filter((row): row is { member: typeof row.member; person: Jamaah } => Boolean(row.person))

  const visibleContacts = guardianContacts.filter((item) => visibleIds.has(item.jamaahId))
  const linkedJamaahCount = new Set(familyMembers.filter((item) => canManage || visibleIds.has(item.jamaahId)).map((item) => item.jamaahId)).size
  const withoutContact = pageJamaah.filter((item) => !preferredContactForJamaah(item, guardianContacts, jamaah)).length

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
      setMessage(feedbackOk('Data keluarga berhasil disimpan.'))
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : 'Gagal menyimpan data keluarga.')
    } finally {
      setSaving(false)
    }
  }

  async function removeSelectedFamily(family: Family) {
    const approved = await confirm({
      title: `Hapus ${family.name}?`,
      description: 'Keanggotaan keluarga akan dilepas, tetapi data warganya tetap tersimpan dan dapat dikelompokkan ulang kapan saja.',
      confirmLabel: 'Hapus Keluarga',
      tone: 'danger',
    })
    if (!approved) return
    try {
      await deleteFamily(family.id)
      setMessage(feedbackOk('Data keluarga berhasil dihapus.'))
    } catch (cause) {
      setMessage(feedbackFrom(cause, 'Gagal menghapus data keluarga.'))
    }
  }

  // Dua tombol wali ditekan dari dalam tabel yang panjang, sementara InlineMessage
  // ada di puncak halaman. Aksi lain di sini selalu lewat modal yang menutup, jadi
  // pandangan kembali ke atas dengan sendirinya -- dua ini tidak, dan kegagalannya
  // jadi senyap total. Hanya kegagalan yang digulung: pada keberhasilan, tombol
  // tautannya justru baru muncul di baris itu dan menggulung ke atas menyembunyikannya.
  function announceFailure(feedback: Feedback) {
    setMessage(feedback)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Token tidak pernah ikut bootstrap, jadi tidak ada salinan yang bisa dikirim ulang:
  // setiap pengiriman membuat tautan baru dan mematikan tautan sebelumnya.
  async function shareWaliAccess(person: Jamaah, waNumber: string) {
    try {
      const token = await setWaliAccess(person.id, true)
      if (!token) throw new Error('Tautan wali gagal dibuat.')
      const link = buildWaliLink(window.location.origin, token)
      const message = buildWaliInviteMessage({ waliName: person.fullName, link })
      openWaliModal(person, {
        link,
        waUrl: waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}` : '',
      })
    } catch (cause) {
      announceFailure(feedbackFrom(cause, 'Gagal membuat tautan wali.'))
    }
  }

  function openWaliModal(person: Jamaah, sharing: { link: string; waUrl: string } = { link: '', waUrl: '' }) {
    const current = waliAccess.find((item) => item.jamaahId === person.id)
    setWindowDraft(current ? { windowPreset: current.windowPreset, fromMonth: current.fromMonth, toMonth: current.toMonth } : WALI_WINDOW_DEFAULT)
    setWindowMessage(null)
    setWaliShare({ jamaahId: person.id, waliName: person.fullName, ...sharing })
  }

  // Modal tidak ditutup setelah menyimpan: tokennya tidak pernah ikut bootstrap, jadi
  // tautan yang sedang tampil tidak bisa ditampilkan lagi tanpa memutar token baru.
  async function saveWaliWindow() {
    if (!waliShare) return
    try {
      await setWaliWindow(waliShare.jamaahId, windowDraft)
      setWindowMessage(feedbackOk('Rentang disimpan. Wali melihat perubahannya saat membuka tautannya lagi.'))
    } catch (cause) {
      setWindowMessage(feedbackFrom(cause, 'Gagal menyimpan rentang.'))
    }
  }

  async function copyWaliLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setMessage(feedbackOk('Tautan wali disalin ke papan klip.'))
    } catch {
      announceFailure(feedbackError(`Papan klip tidak dapat diakses. Tautannya: ${link}`))
    }
  }

  async function revokeWaliAccess(person: Jamaah) {
    const approved = await confirm({
      title: `Cabut akses wali ${person.fullName}?`,
      description: 'Tautan yang sudah dikirim akan langsung berhenti berfungsi. Akses dapat diaktifkan lagi kapan saja dengan tautan baru.',
      confirmLabel: 'Cabut Akses',
      tone: 'danger',
    })
    if (!approved) return
    try {
      await setWaliAccess(person.id, false)
      setMessage(feedbackOk('Akses wali dicabut.'))
    } catch (cause) {
      announceFailure(feedbackFrom(cause, 'Gagal mencabut akses wali.'))
    }
  }

  function openCreateGuardian(person?: Jamaah) {
    const now = new Date().toISOString()
    setGuardianForm({ ...EMPTY_GUARDIAN, id: `new-${crypto.randomUUID()}`, jamaahId: person?.id ?? pageJamaah[0]?.id ?? '', createdAt: now, updatedAt: now })
    setGuardianSearch('')
    setModalError(null)
    setGuardianOpen(true)
  }

  function openEditGuardian(contact: GuardianContact) {
    setGuardianForm({ ...contact })
    setGuardianSearch(contact.guardianJamaahId ? '' : contact.fullName)
    setModalError(null)
    setGuardianOpen(true)
  }

  function selectGuardian(person: Jamaah) {
    const isSelf = person.id === guardianForm.jamaahId
    setGuardianForm((current) => ({
      ...current,
      guardianJamaahId: person.id,
      fullName: person.fullName,
      phone: person.phone,
      relationship: isSelf ? 'Diri Sendiri' : current.relationship === 'Diri Sendiri' ? 'Wali' : current.relationship,
    }))
    setGuardianSearch('')
  }

  function selectGuardianTarget(jamaahId: string) {
    setGuardianForm((current) => ({
      ...current,
      jamaahId,
      relationship: current.guardianJamaahId === jamaahId
        ? 'Diri Sendiri'
        : current.relationship === 'Diri Sendiri' ? 'Wali' : current.relationship,
    }))
  }

  async function submitGuardian() {
    setSaving(true)
    setModalError(null)
    try {
      const selectedGuardian = guardianForm.guardianJamaahId ? jamaahMap.get(guardianForm.guardianJamaahId) : null
      if (!selectedGuardian) throw new Error('Pilih wali dari data warga.')
      await saveGuardianContact({
        ...guardianForm,
        fullName: selectedGuardian.fullName,
        phone: selectedGuardian.phone,
        notes: guardianForm.notes.trim(),
        updatedAt: new Date().toISOString(),
      })
      setGuardianOpen(false)
      setMessage(feedbackOk('Data wali berhasil ditautkan ke warga.'))
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : 'Gagal menyimpan kontak wali.')
    } finally {
      setSaving(false)
    }
  }

  async function removeSelectedGuardian(contact: GuardianContact) {
    const linked = contact.guardianJamaahId ? jamaahMap.get(contact.guardianJamaahId) : null
    const approved = await confirm({
      title: `Hapus wali ${linked?.fullName ?? contact.fullName}?`,
      description: 'Relasi wali ini akan dilepas dari warga terkait. Data warga yang menjadi wali tidak ikut terhapus.',
      confirmLabel: 'Hapus Wali',
      tone: 'danger',
    })
    if (!approved) return
    try {
      await deleteGuardianContact(contact.id)
      setMessage(feedbackOk('Kontak wali berhasil dihapus.'))
    } catch (cause) {
      setMessage(feedbackFrom(cause, 'Gagal menghapus kontak wali.'))
    }
  }

  const memberCandidates = jamaah
    .filter((item) => !memberSearch || item.fullName.toLowerCase().includes(memberSearch.toLowerCase()))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'))

  const selectedGuardian = guardianForm.guardianJamaahId ? jamaahMap.get(guardianForm.guardianJamaahId) ?? null : null
  const guardianTargetMembership = membershipByJamaah.get(guardianForm.jamaahId)
  const guardianQuery = guardianSearch.trim().toLowerCase()
  const alreadySelectedGuardianIds = new Set(guardianContacts
    .filter((item) => item.jamaahId === guardianForm.jamaahId && item.id !== guardianForm.id)
    .map((item) => item.guardianJamaahId)
    .filter(Boolean))
  const guardianCandidates = jamaah
    .filter((item) => !alreadySelectedGuardianIds.has(item.id))
    .filter((item) => !guardianQuery || [item.fullName, item.phone, item.censusCategory].join(' ').toLowerCase().includes(guardianQuery))
    .sort((first, second) => {
      const firstFamily = membershipByJamaah.get(first.id)?.familyId
      const secondFamily = membershipByJamaah.get(second.id)?.familyId
      const firstSameFamily = Boolean(guardianTargetMembership && firstFamily === guardianTargetMembership.familyId)
      const secondSameFamily = Boolean(guardianTargetMembership && secondFamily === guardianTargetMembership.familyId)
      return Number(secondSameFamily) - Number(firstSameFamily) || first.fullName.localeCompare(second.fullName, 'id')
    })
    .slice(0, 10)

  function resolvedGuardian(contact: GuardianContact) {
    const linked = contact.guardianJamaahId ? jamaahMap.get(contact.guardianJamaahId) : null
    return {
      name: linked?.fullName ?? contact.fullName,
      phone: linked?.phone ?? contact.phone,
      linked: Boolean(linked),
    }
  }

  return (
    <>
      <PageHeader
        title="Keluarga & Kontak Wali"
        description={canManage ? undefined : 'Daftar lengkap warga aktif, keluarga, dan wali dari kelas yang Anda ampu.'}
        actions={canManage ? <><button className="button outline" onClick={() => openCreateGuardian()}><UserRound size={16} /> Tambah Wali</button><button className="button primary" onClick={openCreateFamily}><Plus size={16} /> Tambah Keluarga</button></> : undefined}
      />

      <section className="stats-grid four-columns compact-stats">
        <StatCard tone="mint" label="Keluarga Tercatat" value={accessibleFamilies.length} icon={<House size={20} />} />
        <StatCard tone="sky" label="Warga Terhubung" value={linkedJamaahCount} icon={<UsersRound size={20} />} />
        <StatCard tone="violet" label="Wali Tertaut" value={visibleContacts.filter((item) => item.guardianJamaahId).length} icon={<UserRound size={20} />} />
        <StatCard tone="amber" label="Tanpa Kontak" value={withoutContact} icon={<TriangleAlert size={20} />} />
      </section>

      <InlineMessage value={message} className="page-message" />

      <label className="search-field family-global-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari keluarga, warga, atau nomor kontak…" /></label>

      <article className="card family-section">
        <div className="card-heading"><div><h2>Daftar Keluarga</h2><p>Satu warga hanya dapat terhubung ke satu keluarga, tetapi dapat memiliki beberapa kontak wali.</p></div></div>
        <div className="table-wrap family-table">
          <table role="table">
            <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Keluarga</th><th scope="col" role="columnheader">Anggota</th><th scope="col" role="columnheader">Kontak keluarga</th>{canManage ? <th scope="col" role="columnheader">Aksi</th> : null}</tr></thead>
            <tbody role="rowgroup">
              {familyPagination.pageItems.map((family) => {
                const rows = membersOfFamily(family.id)
                const primary = rows.find((row) => row.member.isPrimaryContact)?.person
                return (
                  <tr role="row" key={family.id}>
                    <td role="cell" data-cell="primary">
                      <button className="person-detail-button" type="button" onClick={() => setDetailFamily(family)} title={`Lihat anggota ${family.name}`}>
                        <Person name={family.name} meta={family.address || 'Alamat belum diisi'} />
                      </button>
                    </td>
                    <td role="cell" data-label="Anggota">{rows.length} orang</td>
                    <td role="cell" data-label="Kontak keluarga">{primary ? primary.fullName : <span className="muted-copy">Belum ditentukan</span>}</td>
                    {canManage ? (
                      <td role="cell" data-label="Aksi" data-cell="full">
                        <div className="table-actions">
                          <button className="icon-button" onClick={() => openEditFamily(family)} aria-label={`Edit ${family.name}`}><Pencil size={15} /></button>
                          <button className="icon-button danger-icon" onClick={() => void removeSelectedFamily(family)} aria-label={`Hapus ${family.name}`}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
              {!visibleFamilies.length ? <tr role="row"><td role="cell" colSpan={canManage ? 4 : 3}><EmptyState icon={<House size={20} />} title="Belum ada data keluarga" description="Kelompokkan warga ke dalam keluarga agar kontak wali dan hubungan antaranggota mudah ditelusuri." action={canManage ? <button className="button primary" type="button" onClick={openCreateFamily}><Plus size={16} /> Tambah Keluarga</button> : undefined} /></td></tr> : null}
            </tbody>
          </table>
        </div>
        <Pagination page={familyPagination.page} pageSize={familyPagination.pageSize} totalItems={visibleFamilies.length} onPageChange={familyPagination.setPage} onPageSizeChange={familyPagination.setPageSize} />
      </article>

      <article className="card family-section">
        <div className="card-heading"><div><h2>Data Warga dan Wali</h2><p>Wali dipilih dari data warga. Nomor warga diprioritaskan; jika kosong, sistem menggunakan nomor wali utama yang tertaut.</p></div></div>
        <div className="table-wrap guardian-table">
          <table role="table">
            <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Warga</th><th scope="col" role="columnheader">Kontak Utama</th><th scope="col" role="columnheader">Aksi</th></tr></thead>
            <tbody role="rowgroup">
              {contactPagination.pageItems.map((person) => {
                const preferred = preferredContactForJamaah(person, guardianContacts, jamaah)
                const waNumber = preferred ? normalizeWhatsappNumber(preferred.phone) : ''
                return (
                  <tr role="row" key={person.id}>
                    <td role="cell" data-cell="primary">
                      <button className="person-detail-button" type="button" onClick={() => setDetailPerson(person)} title={`Lihat detail ${person.fullName}`}>
                        <Person name={person.fullName} meta={`${person.gender} · ${person.censusCategory}`} />
                      </button>
                      {!person.active ? <span className="badge danger">Nonaktif</span> : null}
                    </td>
                    <td role="cell" data-label="Kontak utama">{preferred ? <><strong>{preferred.name}</strong><div className="table-subtle">{preferred.relationship} · {preferred.phone}</div></> : <span className="badge warning">Belum ada kontak</span>}</td>
                    <td role="cell" data-label="Aksi" data-cell="full">
                      <div className="table-actions">
                        {waNumber ? <a className="button outline small" href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a> : null}
                        <button className="button soft small" type="button" onClick={() => setDetailPerson(person)}>Detail</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!contactRows.length ? <tr role="row"><td role="cell" colSpan={3}><div className="empty-state">Tidak ada warga yang sesuai pencarian.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
        <Pagination page={contactPagination.page} pageSize={contactPagination.pageSize} totalItems={contactRows.length} onPageChange={contactPagination.setPage} onPageSizeChange={contactPagination.setPageSize} />
      </article>

      <Modal
        open={Boolean(detailPerson)}
        title="Detail Warga & Wali"
        onClose={() => setDetailPerson(null)}
        wide
      >
        {detailPerson ? (() => {
          const membership = membershipByJamaah.get(detailPerson.id)
          const family = membership ? familyMap.get(membership.familyId) : null
          const contacts = guardianContacts.filter((item) => item.jamaahId === detailPerson.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
          const isGuardian = guardianContacts.some((item) => item.guardianJamaahId === detailPerson.id && item.jamaahId !== detailPerson.id)
          const hasWaliAccess = waliAccess.some((item) => item.jamaahId === detailPerson.id)
          const age = ageFromBirthDate(detailPerson.birthDate)
          const classNames = detailPerson.classIds.map((id) => classes.find((item) => item.id === id)?.name).filter(Boolean)
          const waNumber = (() => {
            const preferred = preferredContactForJamaah(detailPerson, guardianContacts, jamaah)
            return preferred ? normalizeWhatsappNumber(preferred.phone) : ''
          })()
          return (
            <>
              <div className="followup-modal-summary">
                <Person name={detailPerson.fullName} meta={`${detailPerson.gender} · ${detailPerson.censusCategory}`} />
                {!detailPerson.active ? <span className="badge danger">Nonaktif</span> : null}
              </div>
              <dl className="person-facts">
                <div><dt>Tanggal lahir</dt><dd>{detailPerson.birthDate ? `${formatDate(detailPerson.birthDate)} · ${age} tahun` : 'Belum diisi'}</dd></div>
                <div><dt>Nomor pribadi</dt><dd>{detailPerson.phone || 'Belum diisi'}</dd></div>
                <div><dt>Keluarga</dt><dd>{family ? `${family.name}${membership?.relationship ? ` · ${membership.relationship}` : ''}` : 'Belum terhubung'}</dd></div>
                <div><dt>Akses wali</dt><dd>{hasWaliAccess ? 'Aktif' : 'Belum aktif'}</dd></div>
                <div className="span-two">
                  <dt>Kelas pengajian</dt>
                  <dd>{classNames.length ? <div className="badge-list">{classNames.map((name) => <span className="badge muted" key={name}>{name}</span>)}</div> : 'Belum terdaftar di kelas mana pun'}</dd>
                </div>
                <div className="span-two">
                  <dt>Kontak wali</dt>
                  <dd>
                    <div className="guardian-contact-list">
                      {contacts.map((contact) => {
                        const resolved = resolvedGuardian(contact)
                        return (
                          <button className="guardian-contact-chip" key={contact.id} type="button" onClick={() => canManage && openEditGuardian(contact)} disabled={!canManage}>
                            <span>{resolved.name}</span>
                            <small>{contact.relationship}{contact.isPrimary ? ' · Utama' : ''}{resolved.linked ? ' · Tertaut' : ' · Data lama'}</small>
                          </button>
                        )
                      })}
                      {!contacts.length ? <span className="badge warning">Belum ada wali</span> : null}
                    </div>
                  </dd>
                </div>
              </dl>
              <div className="button-row compact-actions">
                {waNumber ? <a className="button outline small" href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp <ExternalLink size={11} /></a> : null}
                {canManage ? <button className={`button small ${contacts.length ? 'soft' : 'primary'}`} onClick={() => openCreateGuardian(detailPerson)}><Plus size={14} /> {contacts.length ? 'Tambah Wali Lain' : 'Tambah Wali'}</button> : null}
                {canManage && isGuardian ? <button className="button soft small" onClick={() => void shareWaliAccess(detailPerson, waNumber)}><KeyRound size={14} /> {hasWaliAccess ? 'Tautan Baru' : 'Aktifkan Akses'}</button> : null}
                {canManage && hasWaliAccess ? <button className="button soft small" onClick={() => openWaliModal(detailPerson)}><CalendarCog size={14} /> Rentang</button> : null}
                {canManage && hasWaliAccess ? <button className="button outline small" onClick={() => void revokeWaliAccess(detailPerson)}><Link2Off size={14} /> Cabut</button> : null}
              </div>
            </>
          )
        })() : null}
      </Modal>

      <Modal
        open={Boolean(detailFamily)}
        title="Detail Keluarga"
        onClose={() => setDetailFamily(null)}
        wide
      >
        {detailFamily ? (
          <>
            <div className="followup-modal-summary">
              <Person name={detailFamily.name} meta={detailFamily.address || 'Alamat belum diisi'} />
              {detailFamily.notes ? <p className="family-notes">{detailFamily.notes}</p> : null}
            </div>
            <div className="family-members">
              {membersOfFamily(detailFamily.id).map(({ member, person }) => (
                <div key={member.jamaahId}>
                  <Person name={person.fullName} meta={`${member.relationship} · ${person.censusCategory}`} />
                  {member.isPrimaryContact ? <span className="badge info">Kontak keluarga</span> : null}
                </div>
              ))}
              {!membersOfFamily(detailFamily.id).length ? <div className="empty-state">Tidak ada anggota yang dapat dilihat.</div> : null}
            </div>
            {canManage ? (
              <div className="modal-inline-actions">
                <button className="button danger" type="button" onClick={() => { const target = detailFamily; setDetailFamily(null); void removeSelectedFamily(target) }}><Trash2 size={15} /> Hapus Keluarga</button>
                <div><button className="button outline" type="button" onClick={() => setDetailFamily(null)}>Tutup</button><button className="button primary" type="button" onClick={() => { const target = detailFamily; setDetailFamily(null); openEditFamily(target) }}><Pencil size={15} /> Edit Keluarga</button></div>
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(waliShare)}
        title={waliShare?.link ? 'Tautan Akses Wali' : 'Rentang Absensi Wali'}
        onClose={() => setWaliShare(null)}
        footer={<><button className="button outline" onClick={() => setWaliShare(null)}>Tutup</button><button className={waliShare?.link ? 'button soft' : 'button primary'} onClick={() => void saveWaliWindow()}><CalendarCog size={16} /> Simpan Rentang</button>{waliShare?.link ? <button className="button soft" onClick={() => void copyWaliLink(waliShare.link)}><Copy size={16} /> Salin Tautan</button> : null}{waliShare?.waUrl ? <a className="button primary" href={waliShare.waUrl} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Kirim via WhatsApp <ExternalLink size={12} /></a> : null}</>}
      >
        <div className="form-grid one-column">
          {waliShare?.link ? (
            <>
              <p>Tautan untuk <strong>{waliShare.waliName}</strong>. Tautan lama otomatis tidak berlaku.</p>
              <code className="wali-link">{waliShare.link}</code>
              <InlineMessage value={feedbackInfo('Tautan ini adalah kuncinya: siapa pun yang menerimanya dapat melihat absensi keluarga tersebut. Pakai tombol Cabut bila tautannya tersebar.')} />
            </>
          ) : <p>Rentang absensi yang dilihat <strong>{waliShare?.waliName}</strong>. Tautan yang sudah dikirim tetap berlaku.</p>}
          <label>Rentang yang ditampilkan
            <select value={windowDraft.windowPreset} onChange={(event) => setWindowDraft({ ...windowDraft, windowPreset: event.target.value as WaliWindow['windowPreset'] })}>
              {WALI_WINDOW_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <small>Pilihan selain Rentang sendiri ikut berjalan tiap bulan, jadi tidak perlu diperbarui.</small>
          </label>
          {windowDraft.windowPreset === 'custom' ? (
            <div className="form-grid">
              <label>Dari bulan *<MonthField value={windowDraft.fromMonth} onChange={(fromMonth) => setWindowDraft({ ...windowDraft, fromMonth })} /></label>
              <label>Sampai bulan *<MonthField value={windowDraft.toMonth} onChange={(toMonth) => setWindowDraft({ ...windowDraft, toMonth })} /></label>
            </div>
          ) : null}
          <InlineMessage value={windowMessage ?? feedbackInfo(`Yang terlihat wali: ${windowPreview}.`)} />
        </div>
      </Modal>

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
        title={guardianContacts.some((item) => item.id === guardianForm.id) ? 'Edit Wali' : 'Tambah Wali'}
        onClose={() => !saving && setGuardianOpen(false)}
        footer={<><button className="button outline" disabled={saving} onClick={() => setGuardianOpen(false)}>Batal</button><button className="button primary" disabled={saving || !guardianForm.guardianJamaahId} onClick={() => void submitGuardian()}>{saving ? 'Menyimpan…' : 'Simpan Wali'}</button></>}
      >
        <div className="form-grid one-column">
          <label>Warga yang menerima wali *<select value={guardianForm.jamaahId} onChange={(event) => selectGuardianTarget(event.target.value)}>{[...jamaah].sort((a, b) => a.fullName.localeCompare(b.fullName, 'id')).map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.censusCategory}{item.active ? '' : ' · Nonaktif'}</option>)}</select></label>
          <button className="button soft guardian-self-button" type="button" onClick={() => {
            const person = jamaahMap.get(guardianForm.jamaahId)
            if (person) selectGuardian(person)
          }}><UserRound size={15} /> Jadikan warga ini sebagai wali dirinya sendiri</button>

          <div className="guardian-picker-field">
            <span>Pilih wali dari data warga *</span>
            {selectedGuardian ? <div className="selected-guardian-card"><Person name={selectedGuardian.fullName} meta={`${selectedGuardian.censusCategory}${selectedGuardian.active ? '' : ' · Nonaktif'}`} /><div><strong>{selectedGuardian.phone || 'Nomor belum diisi'}</strong><small><Link2 size={11} /> Tertaut ke Data Sensus</small></div></div> : guardianForm.fullName ? <div className="notice warning-notice">Data lama: <strong>{guardianForm.fullName}</strong> belum tertaut. Cari dan pilih warga yang sesuai sebelum menyimpan.</div> : null}
            <label className="search-field"><Search size={15} /><input value={guardianSearch} onChange={(event) => setGuardianSearch(event.target.value)} placeholder="Cari nama, kategori, atau nomor WhatsApp…" /></label>
            <div className="guardian-candidate-list">
              {guardianCandidates.map((person) => {
                const sameFamily = Boolean(guardianTargetMembership && membershipByJamaah.get(person.id)?.familyId === guardianTargetMembership.familyId)
                const selected = person.id === guardianForm.guardianJamaahId
                return <button className={selected ? 'selected' : ''} type="button" key={person.id} onClick={() => selectGuardian(person)}><Person name={person.fullName} meta={`${person.censusCategory}${person.active ? '' : ' · Nonaktif'}`} /><span>{person.id === guardianForm.jamaahId ? 'Diri sendiri' : sameFamily ? 'Satu keluarga' : person.phone || 'Nomor belum diisi'}</span></button>
              })}
              {!guardianCandidates.length ? <div className="empty-state">Tidak ada warga yang sesuai pencarian.</div> : null}
            </div>
          </div>

          <label>Hubungan<select value={guardianForm.relationship} disabled={guardianForm.guardianJamaahId === guardianForm.jamaahId} onChange={(event) => setGuardianForm({ ...guardianForm, relationship: event.target.value as GuardianRelationship })}>{guardianForm.guardianJamaahId === guardianForm.jamaahId ? <option>Diri Sendiri</option> : GUARDIAN_RELATIONSHIPS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Nomor WhatsApp wali<input value={selectedGuardian?.phone ?? guardianForm.phone} readOnly placeholder="Belum diisi pada Data Sensus" /><small>Nomor mengikuti profil warga terpilih. Perbarui melalui menu Data Sensus jika perlu.</small></label>
          <label className="simple-checkbox"><input type="checkbox" checked={guardianForm.isPrimary} onChange={(event) => setGuardianForm({ ...guardianForm, isPrimary: event.target.checked })} /> Jadikan wali utama untuk warga ini</label>
          <label>Catatan<textarea rows={3} value={guardianForm.notes} onChange={(event) => setGuardianForm({ ...guardianForm, notes: event.target.value })} placeholder="Contoh: dapat dihubungi setelah pukul 17.00" /></label>
        </div>
        {guardianContacts.some((item) => item.id === guardianForm.id) ? <button className="button danger guardian-delete" disabled={saving} onClick={() => { const contact = guardianContacts.find((item) => item.id === guardianForm.id); if (contact) { setGuardianOpen(false); void removeSelectedGuardian(contact) } }}><Trash2 size={15} /> Hapus Wali</button> : null}
        {modalError ? <div className="form-error">{modalError}</div> : null}
      </Modal>
      {confirmDialog}
    </>
  )
}
