import { CheckCircle2, Download, FileText, ListChecks, Pencil, Plus, Search, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { PageHeader, Person, StatCard } from '../components/UI'
import { plainTextFromRichText, RichTextContent, RichTextEditor } from '../components/RichTextEditor'
import { useData } from '../contexts/DataContext'
import { downloadMeetingNotePdf } from '../lib/meetingNotePdf'
import { formatDate, formatShortDate, localIsoDate } from '../lib/utils'
import type { MeetingAction, MeetingActionStatus, MeetingNote } from '../types/domain'

const ACTION_STATUS_LABELS: Record<MeetingActionStatus, string> = {
  pending: 'Belum mulai',
  in_progress: 'Berjalan',
  completed: 'Selesai',
}

function actionBadge(status: MeetingActionStatus): string {
  if (status === 'completed') return 'success'
  if (status === 'in_progress') return 'info'
  return 'warning'
}

function blankNote(): MeetingNote {
  const now = new Date().toISOString()
  return {
    id: `new-${crypto.randomUUID()}`,
    title: '',
    meetingDate: localIsoDate(),
    agenda: '',
    discussionSummary: '',
    decisions: '',
    additionalNotes: '',
    status: 'draft',
    participantIds: [],
    createdBy: null,
    createdAt: now,
    updatedAt: now,
  }
}

function blankAction(meetingNoteId: string): MeetingAction {
  const now = new Date().toISOString()
  return {
    id: `new-${crypto.randomUUID()}`,
    meetingNoteId,
    task: '',
    assigneeJamaahId: null,
    dueDate: '',
    status: 'pending',
    notes: '',
    createdBy: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function MeetingNotesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { jamaah, meetingNotes, meetingActions, visibleJamaah, saveMeetingNote } = useData()
  const [search, setSearch] = useState('')
  const [participantSearch, setParticipantSearch] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [form, setForm] = useState<{ note: MeetingNote; actions: MeetingAction[] } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const dirtyRef = useRef(false)

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const selectedId = searchParams.get('id')
  const selected = meetingNotes.find((item) => item.id === selectedId) ?? meetingNotes[0] ?? null
  const isCreating = searchParams.get('new') === '1'
  const detailActions = selected ? meetingActions.filter((item) => item.meetingNoteId === selected.id) : []
  const jamaahMap = useMemo(() => new Map(jamaah.map((item) => [item.id, item])), [jamaah])
  const filteredNotes = meetingNotes.filter((item) => `${item.title} ${item.agenda} ${item.decisions}`.toLowerCase().includes(search.toLowerCase()))
  const openActionCount = meetingActions.filter((item) => item.status !== 'completed').length
  const completedActionCount = meetingActions.filter((item) => item.status === 'completed').length

  // Membuka atau menyegarkan /notulensi?new=1 secara langsung tidak melewati createNote,
  // sehingga form perlu disiapkan di sini agar halaman tidak tampil kosong.
  useEffect(() => {
    if (!isCreating || form) return
    setForm({ note: blankNote(), actions: [] })
    setDirty(false)
  }, [form, isCreating])

  function createNote() {
    setForm({ note: blankNote(), actions: [] })
    setParticipantSearch('')
    setMessage(null)
    setDirty(false)
    navigate('/notulensi?new=1')
  }

  function editNote(note: MeetingNote) {
    setForm({ note: { ...note, participantIds: [...note.participantIds] }, actions: detailActions.map((item) => ({ ...item })) })
    setParticipantSearch('')
    setMessage(null)
    setDirty(false)
    navigate(`/notulensi?edit=${encodeURIComponent(note.id)}`)
  }

  function closeForm(discardChanges = false) {
    if (dirtyRef.current && !discardChanges) {
      setDiscardOpen(true)
      return
    }
    setForm(null)
    setDirty(false)
    setDiscardOpen(false)
    if (selected) navigate(`/notulensi?id=${encodeURIComponent(selected.id)}`)
    else navigate('/notulensi')
  }

  function updateNote(patch: Partial<MeetingNote>) {
    setDirty(true)
    setForm((current) => current ? { ...current, note: { ...current.note, ...patch } } : current)
  }

  function addParticipant(id: string) {
    setDirty(true)
    setForm((current) => {
      if (!current || current.note.participantIds.includes(id)) return current
      return { ...current, note: { ...current.note, participantIds: [...current.note.participantIds, id] } }
    })
    setParticipantSearch('')
  }

  function removeParticipant(id: string) {
    setDirty(true)
    setForm((current) => current ? {
      ...current,
      note: { ...current.note, participantIds: current.note.participantIds.filter((item) => item !== id) },
      actions: current.actions.map((item) => item.assigneeJamaahId === id ? { ...item, assigneeJamaahId: null } : item),
    } : current)
  }

  function updateAction(id: string, patch: Partial<MeetingAction>) {
    setDirty(true)
    setForm((current) => current ? { ...current, actions: current.actions.map((item) => item.id === id ? { ...item, ...patch } : item) } : current)
  }

  function removeAction(id: string) {
    setDirty(true)
    setForm((current) => current ? { ...current, actions: current.actions.filter((item) => item.id !== id) } : current)
  }

  function addAction() {
    setDirty(true)
    setForm((current) => current ? { ...current, actions: [...current.actions, blankAction(current.note.id)] } : current)
  }

  async function save(status: MeetingNote['status']) {
    if (!form) return
    setWorking(true)
    setMessage(null)
    const actions = form.actions.filter((item) => item.task.trim())
    if (status === 'final' && actions.some((item) => !item.assigneeJamaahId)) {
      setMessage('Setiap tindak lanjut yang diisi perlu memiliki penanggung jawab dari peserta.')
      setWorking(false)
      return
    }
    try {
      const saved = await saveMeetingNote({ note: { ...form.note, status, title: form.note.title.trim() }, actions })
      setForm(null)
      setDirty(false)
      navigate(`/notulensi?id=${encodeURIComponent(saved.id)}`)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Gagal menyimpan notulensi.')
    } finally {
      setWorking(false)
    }
  }

  function exportPdf(note: MeetingNote) {
    downloadMeetingNotePdf({
      title: note.title,
      dateLabel: formatDate(note.meetingDate),
      statusLabel: 'Final',
      participantNames: note.participantIds.map((id) => jamaahMap.get(id)?.fullName ?? 'Warga'),
      agenda: plainTextFromRichText(note.agenda),
      discussionSummary: plainTextFromRichText(note.discussionSummary),
      decisions: plainTextFromRichText(note.decisions),
      additionalNotes: plainTextFromRichText(note.additionalNotes),
      actions: meetingActions.filter((item) => item.meetingNoteId === note.id).map((item) => ({
        task: item.task,
        assigneeName: item.assigneeJamaahId ? jamaahMap.get(item.assigneeJamaahId)?.fullName ?? 'Warga' : '',
        dueDateLabel: item.dueDate ? formatShortDate(item.dueDate) : '',
        status: ACTION_STATUS_LABELS[item.status],
      })),
    }, `notulensi-${note.meetingDate}-${note.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.pdf`)
  }

  if (isCreating || searchParams.get('edit')) {
    const activeForm = form ?? (searchParams.get('edit') && selected ? { note: { ...selected, participantIds: [...selected.participantIds] }, actions: detailActions.map((item) => ({ ...item })) } : null)
    if (!activeForm) return null
    const selectedParticipants = activeForm.note.participantIds.map((id) => jamaahMap.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item))
    const candidates = visibleJamaah
      .filter((item) => item.active && !activeForm.note.participantIds.includes(item.id) && item.fullName.toLowerCase().includes(participantSearch.toLowerCase()))
      .slice(0, 8)
    return (
      <>
        <PageHeader title={isCreating ? 'Buat Notulensi' : 'Edit Notulensi'} description="Catat pembahasan, keputusan, dan tugas yang perlu ditindaklanjuti." actions={<button className="button outline" type="button" onClick={() => closeForm()}>Kembali</button>} />
        <article className="card meeting-form-card">
          <div className="section-heading"><div><h2>Informasi musyawarah</h2><p>Informasi dasar yang diperlukan untuk menyimpan notulensi.</p></div><span className={`badge ${activeForm.note.status === 'final' ? 'success' : 'warning'}`}>{activeForm.note.status === 'final' ? 'Final' : 'Draft'}</span></div>
          <div className="form-grid">
            <label className="form-span-two">Judul musyawarah<input autoFocus value={activeForm.note.title} onChange={(event) => updateNote({ title: event.target.value })} placeholder="Contoh: Evaluasi kegiatan bulan Agustus" /></label>
            <label>Tanggal<input type="date" value={activeForm.note.meetingDate} onChange={(event) => updateNote({ meetingDate: event.target.value })} /></label>
            <label>Status<select value={activeForm.note.status} onChange={(event) => updateNote({ status: event.target.value as MeetingNote['status'] })}><option value="draft">Draft</option><option value="final">Final</option></select></label>
            <fieldset className="form-span-two participant-picker"><legend>Peserta dari Data Warga</legend><p className="field-help">Cari nama warga, lalu pilih dari hasil yang muncul. Hanya warga yang sudah dipilih yang tersedia sebagai penanggung jawab.</p><label className="search-field"><Search size={15} /><input value={participantSearch} onChange={(event) => setParticipantSearch(event.target.value)} placeholder="Ketik nama warga untuk mencari..." /></label>{participantSearch ? <div className="participant-candidates">{candidates.map((person) => <button type="button" key={person.id} onClick={() => addParticipant(person.id)}><Plus size={14} /> {person.fullName}<small>{person.censusCategory}</small></button>)}{!candidates.length ? <span className="field-help">Warga tidak ditemukan atau sudah dipilih.</span> : null}</div> : null}<div className="selected-participants">{selectedParticipants.map((person) => <span className="selected-person" key={person.id}><Person name={person.fullName} meta={person.censusCategory} /><button type="button" onClick={() => removeParticipant(person.id)} aria-label={`Hapus ${person.fullName}`}><X size={13} /></button></span>)}{!selectedParticipants.length ? <span className="empty-inline"><Users size={15} /> Belum ada peserta dipilih.</span> : null}</div></fieldset>
          </div>
          <div className="section-heading meeting-content-heading"><div><h2>Hasil Musyawarah</h2><p>Keputusan menjelaskan apa yang disepakati; tindak lanjut di bawahnya mengubah keputusan menjadi tugas yang dapat dilacak.</p></div></div>
          <div className="form-grid"><RichTextEditor label="Agenda / pokok pembahasan" value={activeForm.note.agenda} onChange={(value) => updateNote({ agenda: value })} placeholder="Tuliskan agenda, satu poin per baris..." /><RichTextEditor label="Ringkasan pembahasan" value={activeForm.note.discussionSummary} onChange={(value) => updateNote({ discussionSummary: value })} placeholder="Tuliskan hal-hal penting yang dibahas..." /><RichTextEditor label="Keputusan / kesimpulan" value={activeForm.note.decisions} onChange={(value) => updateNote({ decisions: value })} placeholder="Tuliskan hasil yang benar-benar disepakati..." /><RichTextEditor label="Catatan tambahan" value={activeForm.note.additionalNotes} onChange={(value) => updateNote({ additionalNotes: value })} placeholder="Catatan lain, jika ada..." optional /></div>
          <div className="section-heading meeting-content-heading"><div><h2>Tindak lanjut keputusan</h2><p>Setiap tugas dapat diberi penanggung jawab dari peserta dan tenggat waktu.</p></div><button className="button soft small" type="button" onClick={addAction}><Plus size={14} /> Tambah tugas</button></div>
          <div className="meeting-action-editor">{activeForm.actions.map((action) => <div className="meeting-action-edit-row" key={action.id}><input className="meeting-action-task" value={action.task} onChange={(event) => updateAction(action.id, { task: event.target.value })} placeholder="Tugas atau keputusan yang perlu dikerjakan" /><div className="meeting-action-meta"><select value={action.assigneeJamaahId ?? ''} onChange={(event) => updateAction(action.id, { assigneeJamaahId: event.target.value || null })}><option value="">Pilih penanggung jawab</option>{selectedParticipants.map((person) => <option value={person.id} key={person.id}>{person.fullName}</option>)}</select><input type="date" value={action.dueDate} onChange={(event) => updateAction(action.id, { dueDate: event.target.value })} /><select value={action.status} onChange={(event) => updateAction(action.id, { status: event.target.value as MeetingActionStatus })}>{Object.entries(ACTION_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="icon-button danger-icon" type="button" onClick={() => removeAction(action.id)} aria-label="Hapus tugas">×</button></div></div>)}{!activeForm.actions.length ? <div className="empty-state">Belum ada tindak lanjut. Tambahkan jika ada keputusan yang perlu dikerjakan.</div> : null}</div>
          {message ? <div className="inline-message error">{message}</div> : null}
          <div className="modal-inline-actions meeting-form-footer"><span className="field-help">Ekspor PDF tersedia setelah notulensi berstatus Final.</span><div><button className="button outline" type="button" disabled={working} onClick={() => void save('draft')}>Simpan Draft</button><button className="button primary" type="button" disabled={working} onClick={() => void save('final')}>{working ? 'Menyimpan…' : 'Simpan &amp; Finalkan'}</button></div></div>
        </article>

        <Modal
          open={discardOpen}
          title="Tinggalkan tanpa menyimpan?"
          onClose={() => setDiscardOpen(false)}
          footer={<>
            <button className="button outline" type="button" onClick={() => setDiscardOpen(false)}>Lanjut mengisi</button>
            <button className="button danger" type="button" onClick={() => closeForm(true)}>Buang perubahan</button>
          </>}
        >
          <p className="modal-help">Ada perubahan pada notulensi ini yang belum disimpan. Kalau ditinggalkan sekarang, isian tersebut hilang. Gunakan <strong>Simpan Draft</strong> bila belum siap difinalkan.</p>
        </Modal>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Notulensi Musyawarah" description="Catat pembahasan, keputusan, dan pekerjaan setelah musyawarah." actions={<button className="button primary" type="button" onClick={createNote}><Plus size={16} /> Buat Notulensi</button>} />
      <section className="stats-grid three-columns"><StatCard label="Total Notulensi" value={meetingNotes.length} note="Seluruh catatan musyawarah" icon={<FileText size={20} />} /><StatCard label="Tindak Lanjut Terbuka" value={openActionCount} note="Belum berstatus selesai" icon={<ListChecks size={20} />} /><StatCard label="Tindak Lanjut Selesai" value={completedActionCount} note="Dari seluruh notulensi" icon={<CheckCircle2 size={20} />} /></section>
      <div className="meeting-layout"><article className="card"><div className="section-heading"><div><h2>Daftar Notulensi</h2><p>Pilih catatan untuk melihat detail.</p></div></div><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari judul atau topik..." /></label><div className="meeting-list">{filteredNotes.map((note) => <button className={`meeting-list-item ${selected?.id === note.id ? 'active' : ''}`} type="button" key={note.id} onClick={() => navigate(`/notulensi?id=${encodeURIComponent(note.id)}`)}><strong>{note.title}</strong><span>{formatShortDate(note.meetingDate)} · {note.participantIds.length} peserta</span><span className={`badge ${note.status === 'final' ? 'success' : 'warning'}`}>{note.status === 'final' ? 'Final' : 'Draft'}</span></button>)}{!filteredNotes.length ? <div className="empty-state">Belum ada notulensi yang sesuai.</div> : null}</div></article>
        <article className="card meeting-detail-card">{selected ? <><div className="meeting-detail-header"><div><span className="field-kicker">Notulensi musyawarah</span><h2>{selected.title}</h2><p>{formatDate(selected.meetingDate)} · {selected.status === 'final' ? 'Sudah final' : 'Masih draft'}</p></div><div className="button-row"><button className="button outline small" type="button" onClick={() => editNote(selected)}><Pencil size={14} /> Edit</button>{selected.status === 'final' ? <button className="button soft small" type="button" onClick={() => exportPdf(selected)}><Download size={14} /> Export PDF</button> : null}</div></div><div className="detail-section"><h3>Peserta <span className="badge muted">{selected.participantIds.length} orang</span></h3><div className="people-list">{selected.participantIds.map((id) => <span className="person-chip" key={id}><Users size={13} /> {jamaahMap.get(id)?.fullName ?? 'Warga'}</span>)}</div></div><div className="detail-section"><h3>Agenda / pokok pembahasan</h3><RichTextContent value={selected.agenda} /></div><div className="detail-section"><h3>Ringkasan pembahasan</h3><RichTextContent value={selected.discussionSummary} /></div><div className="detail-section combined-result"><div className="section-heading"><div><h3>Hasil dan tindak lanjut</h3><p>Keputusan adalah hasil kesepakatan; tindak lanjut adalah tugas yang dipantau sampai selesai.</p></div></div><h4>Keputusan / kesimpulan</h4><RichTextContent value={selected.decisions} /><h4>Tugas tindak lanjut</h4><div className="meeting-action-list">{detailActions.map((action) => <div className="meeting-action-row" key={action.id}><div><strong>{action.task}</strong><small>{action.assigneeJamaahId ? jamaahMap.get(action.assigneeJamaahId)?.fullName ?? 'Warga' : 'Belum ditentukan'} · {action.dueDate ? `Tenggat ${formatDate(action.dueDate)}` : 'Tanpa tenggat'}</small></div><span className={`badge ${actionBadge(action.status)}`}>{ACTION_STATUS_LABELS[action.status]}</span></div>)}{!detailActions.length ? <p className="field-help">Tidak ada tindak lanjut terstruktur.</p> : null}</div></div>{selected.additionalNotes ? <div className="detail-section"><h3>Catatan tambahan</h3><RichTextContent value={selected.additionalNotes} /></div> : null}</> : <div className="empty-state"><FileText size={28} /><p>Belum ada notulensi.</p><button className="button primary" type="button" onClick={createNote}>Buat notulensi pertama</button></div>}</article></div>
    </>
  )
}
