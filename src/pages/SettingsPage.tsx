import { ArrowRightLeft, Download, Eye, EyeOff, KeyRound, Pencil, Power, PowerOff, RotateCcw, ShieldCheck, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { PageHeader, Person } from '../components/UI'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { usePagination } from '../hooks/usePagination'
import type { AppUser } from '../types/domain'
import { downloadJson, formatDateTime, localIsoDate } from '../lib/utils'

interface AdminFormState { fullName: string; email: string; password: string; classIds: string[] }
const EMPTY_FORM: AdminFormState = { fullName: '', email: '', password: '', classIds: [] }

export function SettingsPage() {
  const { isDemo } = useAuth()
  const data = useData()
  const { admins, classes, jamaah, schedules, attendanceSessions, materialCompletions, auditLogs, followUps, reportingPeriods, classHistory, statusHistory, families, familyMembers, guardianContacts, mergeHistory, resetDemo, addAdmin, saveAdminAssignments, setAdminActive, resetAdminPassword, transferAdminClasses } = data
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [resetting, setResetting] = useState<AppUser | null>(null)
  const [statusTarget, setStatusTarget] = useState<AppUser | null>(null)
  const [transferSource, setTransferSource] = useState<AppUser | null>(null)
  const [form, setForm] = useState<AdminFormState>(EMPTY_FORM)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [replacementAdminId, setReplacementAdminId] = useState('')
  const [transferTargetId, setTransferTargetId] = useState('')
  const [transferClassIds, setTransferClassIds] = useState<string[]>([])
  const [reactivationClassIds, setReactivationClassIds] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const activeClasses = useMemo(() => classes.filter((item) => item.active), [classes])
  const activeAdmins = useMemo(() => admins.filter((admin) => admin.active), [admins])
  const filteredAdmins = useMemo(() => admins.filter((admin) => {
    if (statusFilter === 'active' && !admin.active) return false
    if (statusFilter === 'inactive' && admin.active) return false
    const term = search.trim().toLowerCase()
    return !term || `${admin.name} ${admin.email}`.toLowerCase().includes(term)
  }), [admins, search, statusFilter])
  const adminPagination = usePagination(filteredAdmins, `admins-${statusFilter}-${search}`)
  const classCoverage = useMemo(() => new Map(activeClasses.map((studyClass) => [studyClass.id, activeAdmins.filter((admin) => admin.assignedClassIds.includes(studyClass.id)).length])), [activeAdmins, activeClasses])
  const uncoveredClasses = activeClasses.filter((studyClass) => (classCoverage.get(studyClass.id) ?? 0) === 0)
  const allSelected = activeClasses.length > 0 && form.classIds.length === activeClasses.length

  function toggleFormClass(classId: string) { setForm((current) => ({ ...current, classIds: current.classIds.includes(classId) ? current.classIds.filter((id) => id !== classId) : [...current.classIds, classId] })) }
  function selectAllClasses() { setForm((current) => ({ ...current, classIds: allSelected ? [] : activeClasses.map((item) => item.id) })) }
  function toggleTransferClass(classId: string) { setTransferClassIds((current) => current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId]) }
  function toggleReactivationClass(classId: string) { setReactivationClassIds((current) => current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId]) }

  function openCreate() { setError(null); setShowPassword(false); setForm(EMPTY_FORM); setCreateOpen(true) }
  function openEdit(admin: AppUser) { setError(null); setEditing(admin); setForm({ fullName: admin.name, email: admin.email, password: '', classIds: admin.assignedClassIds }) }
  function openReset(admin: AppUser) { setError(null); setTemporaryPassword(''); setShowPassword(false); setResetting(admin) }
  function openStatus(admin: AppUser) { setError(null); setStatusTarget(admin); setReplacementAdminId(''); setReactivationClassIds([]) }
  function openTransfer(admin: AppUser) { setError(null); setTransferSource(admin); setTransferTargetId(''); setTransferClassIds([]) }

  async function run(action: () => Promise<void>) { setSaving(true); setError(null); try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Operasi gagal.') } finally { setSaving(false) } }
  async function submitCreate() {
    if (!form.fullName.trim() || !form.email.trim() || form.password.length < 8) { setError('Nama, email, dan password minimal 8 karakter wajib diisi.'); return }
    if (!form.classIds.length) { setError('Pilih minimal satu kelas yang akan diampu.'); return }
    await run(async () => { await addAdmin({ fullName: form.fullName.trim(), email: form.email.trim(), password: form.password, classIds: form.classIds }); setCreateOpen(false); setForm(EMPTY_FORM) })
  }
  async function submitAssignments() {
    if (!editing) return
    if (!form.classIds.length) { setError('Admin aktif harus ditugaskan minimal ke satu kelas.'); return }
    await run(async () => { await saveAdminAssignments(editing.id, form.classIds); setEditing(null) })
  }
  async function submitReset() {
    if (!resetting) return
    if (temporaryPassword.length < 8) { setError('Password sementara minimal 8 karakter.'); return }
    await run(async () => { await resetAdminPassword(resetting.id, temporaryPassword); setResetting(null); setTemporaryPassword('') })
  }
  async function submitStatus() {
    if (!statusTarget) return
    if (statusTarget.active) {
      const exclusivelyCovered = statusTarget.assignedClassIds.filter((classId) => (classCoverage.get(classId) ?? 0) <= 1)
      if (exclusivelyCovered.length && !replacementAdminId) { setError('Pilih Admin pengganti karena ada kelas yang hanya diampu akun ini.'); return }
      await run(async () => { await setAdminActive(statusTarget.id, false, replacementAdminId || null); setStatusTarget(null) })
      return
    }
    if (!reactivationClassIds.length) { setError('Pilih minimal satu kelas ketika mengaktifkan kembali akun.'); return }
    await run(async () => { await setAdminActive(statusTarget.id, true, null, reactivationClassIds); setStatusTarget(null) })
  }
  async function submitTransfer() {
    if (!transferSource || !transferTargetId || !transferClassIds.length) { setError('Pilih Admin tujuan dan minimal satu kelas.'); return }
    await run(async () => { await transferAdminClasses(transferSource.id, transferTargetId, transferClassIds); setTransferSource(null) })
  }

  function downloadBackup() {
    downloadJson(`backup-sase-portal-${localIsoDate()}.json`, { version: 2, exportedAt: new Date().toISOString(), summary: { classes: classes.length, jamaah: jamaah.length, schedules: schedules.length, attendanceSessions: attendanceSessions.length, materialCompletions: materialCompletions.length, admins: admins.length }, data: { classes, jamaah, schedules, attendanceSessions, materialCompletions, admins, auditLogs, followUps, reportingPeriods, classHistory, statusHistory, families, familyMembers, guardianContacts, mergeHistory } })
  }

  const classPicker = (
    <fieldset className="admin-class-fieldset">
      <div className="admin-class-heading"><div><legend>Kelas yang diampu</legend><small>Admin hanya dapat membuka data dari kelas yang dipilih.</small></div><div className="admin-class-tools"><span>{form.classIds.length} dipilih</span><button type="button" className="text-button" onClick={selectAllClasses}>{allSelected ? 'Kosongkan' : 'Pilih semua'}</button></div></div>
      <div className="admin-class-picker">{activeClasses.map((studyClass) => { const selected = form.classIds.includes(studyClass.id); return <label className={`class-check ${selected ? 'selected' : ''}`} key={studyClass.id}><input type="checkbox" checked={selected} onChange={() => toggleFormClass(studyClass.id)} /><span className="class-check-box">{selected ? '✓' : ''}</span><span>{studyClass.name}</span></label> })}</div>
    </fieldset>
  )

  return <>
    <PageHeader title="Pengaturan Admin" description="Kelola akun, password, status, dan pembagian tanggung jawab wali kelas." actions={<button className="button primary" onClick={openCreate}><UserPlus size={16} /> Tambah Admin</button>} />
    <div className="admin-management-stats"><article className="card"><span>Admin aktif</span><strong>{activeAdmins.length}</strong></article><article className="card"><span>Admin nonaktif</span><strong>{admins.length-activeAdmins.length}</strong></article><article className={`card ${uncoveredClasses.length ? 'warning-card' : ''}`}><span>Kelas tanpa wali</span><strong>{uncoveredClasses.length}</strong><small>{uncoveredClasses.map((item) => item.name).join(', ') || 'Semua kelas memiliki wali'}</small></article></div>
    <div className="notice">Akun yang dinonaktifkan tidak dapat membaca data melalui aplikasi maupun API. Kelas yang hanya memiliki satu wali harus dipindahkan sebelum akun tersebut dinonaktifkan.</div>
    <article className="card">
      <div className="admin-filter-row"><input placeholder="Cari nama atau email Admin…" value={search} onChange={(event) => setSearch(event.target.value)} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="active">Admin aktif</option><option value="inactive">Admin nonaktif</option><option value="all">Semua status</option></select></div>
      <div className="table-wrap"><table><thead><tr><th>Admin</th><th>Kelas yang diampu</th><th>Login terakhir</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
        {filteredAdmins.length ? adminPagination.pageItems.map((admin) => <tr key={admin.id}><td data-cell="primary"><Person name={admin.name} meta={admin.email} />{admin.mustChangePassword ? <span className="badge warning">Wajib ganti password</span> : null}</td><td data-label="Kelas yang diampu"><div className="badge-list">{admin.assignedClassIds.length ? admin.assignedClassIds.map((id) => <span className="badge muted" key={id}>{classes.find((item) => item.id === id)?.name ?? 'Kelas'}</span>) : <span className="muted-text">Belum ada kelas</span>}</div></td><td data-label="Login terakhir">{admin.lastLoginAt ? formatDateTime(admin.lastLoginAt) : 'Belum pernah login'}</td><td data-label="Status"><span className={`badge ${admin.active ? 'success' : 'danger'}`}>{admin.active ? 'Aktif' : 'Nonaktif'}</span></td><td data-label="Aksi" data-cell="full"><div className="admin-action-grid"><button className="button subtle small" disabled={!admin.active} onClick={() => openEdit(admin)}><Pencil size={14} /> Kelas</button><button className="button subtle small" disabled={!admin.active} onClick={() => openTransfer(admin)}><ArrowRightLeft size={14} /> Pindah</button><button className="button subtle small" onClick={() => openReset(admin)}><KeyRound size={14} /> Password</button><button className={`button small ${admin.active ? 'danger' : 'primary'}`} onClick={() => openStatus(admin)}>{admin.active ? <PowerOff size={14} /> : <Power size={14} />}{admin.active ? 'Nonaktifkan' : 'Aktifkan'}</button></div></td></tr>) : <tr><td colSpan={5}><div className="empty-state">Tidak ada akun Admin pada filter ini.</div></td></tr>}
      </tbody></table></div>
      <Pagination page={adminPagination.page} pageSize={adminPagination.pageSize} totalItems={filteredAdmins.length} onPageChange={adminPagination.setPage} onPageSizeChange={adminPagination.setPageSize} />
    </article>

    <article className="card backup-card"><div className="backup-copy"><span className="backup-icon"><ShieldCheck size={20} /></span><div><h2>Backup Data Aplikasi</h2><p>Unduh snapshot JSON termasuk status, login terakhir, dan pembagian kelas Admin.</p></div></div><div className="backup-summary"><span>{jamaah.length} warga</span><span>{attendanceSessions.length} sesi</span><span>{admins.length} Admin</span></div><button className="button primary" onClick={downloadBackup}><Download size={16} /> Unduh Backup</button></article>
    {isDemo ? <article className="card reset-card"><div><h2>Reset Data Demo</h2><p>Kembalikan seluruh perubahan lokal ke data awal development.</p></div><button className="button danger" onClick={() => { if (window.confirm('Reset seluruh data demo?')) resetDemo() }}><RotateCcw size={16} /> Reset Demo</button></article> : null}

    <Modal open={createOpen} title="Tambah Admin / Wali Kelas" onClose={() => !saving && setCreateOpen(false)} wide footer={<><button className="button outline" disabled={saving} onClick={() => setCreateOpen(false)}>Batal</button><button className="button primary" disabled={saving} onClick={() => void submitCreate()}>{saving ? 'Menyimpan…' : 'Buat Akun Admin'}</button></>}><div className="admin-form-intro"><strong>Informasi akun</strong><p>Admin wajib mengganti password awal saat login pertama.</p></div><div className="admin-account-grid"><label className="field"><span>Nama lengkap</span><input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} /></label><label className="field"><span>Email login</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label><label className="field full-row"><span>Password awal</span><div className="password-input"><input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label></div>{classPicker}{error ? <p className="form-error">{error}</p> : null}</Modal>
    <Modal open={Boolean(editing)} title={`Penugasan ${editing?.name ?? 'Admin'}`} onClose={() => !saving && setEditing(null)} wide footer={<><button className="button outline" onClick={() => setEditing(null)}>Batal</button><button className="button primary" disabled={saving} onClick={() => void submitAssignments()}>Simpan Penugasan</button></>}>{classPicker}{error ? <p className="form-error">{error}</p> : null}</Modal>
    <Modal open={Boolean(resetting)} title={`Reset Password ${resetting?.name ?? 'Admin'}`} onClose={() => !saving && setResetting(null)} footer={<><button className="button outline" onClick={() => setResetting(null)}>Batal</button><button className="button primary" disabled={saving} onClick={() => void submitReset()}>Reset Password</button></>}><div className="notice">Admin akan diwajibkan membuat password pribadi saat login berikutnya.</div><label className="field"><span>Password sementara</span><div className="password-input"><input type={showPassword ? 'text' : 'password'} value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>{error ? <p className="form-error">{error}</p> : null}</Modal>
    <Modal open={Boolean(statusTarget)} title={`${statusTarget?.active ? 'Nonaktifkan' : 'Aktifkan'} ${statusTarget?.name ?? 'Admin'}`} onClose={() => !saving && setStatusTarget(null)} footer={<><button className="button outline" onClick={() => setStatusTarget(null)}>Batal</button><button className={`button ${statusTarget?.active ? 'danger' : 'primary'}`} disabled={saving} onClick={() => void submitStatus()}>{statusTarget?.active ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}</button></>}>{statusTarget?.active ? <><div className="notice">Akun akan langsung kehilangan akses. Penugasan kelasnya akan dilepas.</div>{statusTarget.assignedClassIds.some((id) => (classCoverage.get(id) ?? 0) <= 1) ? <label className="field"><span>Alihkan kelas ke Admin</span><select value={replacementAdminId} onChange={(event) => setReplacementAdminId(event.target.value)}><option value="">Pilih Admin pengganti</option>{activeAdmins.filter((admin) => admin.id !== statusTarget.id).map((admin) => <option value={admin.id} key={admin.id}>{admin.name}</option>)}</select></label> : <p className="muted-text">Semua kelas akun ini juga sudah diampu Admin lain.</p>}</> : <fieldset className="admin-class-fieldset"><legend>Pilih kelas setelah akun aktif kembali</legend><div className="admin-class-picker">{activeClasses.map((studyClass) => { const selected=reactivationClassIds.includes(studyClass.id); return <label className={`class-check ${selected?'selected':''}`} key={studyClass.id}><input type="checkbox" checked={selected} onChange={() => toggleReactivationClass(studyClass.id)} /><span className="class-check-box">{selected?'✓':''}</span><span>{studyClass.name}</span></label> })}</div></fieldset>}{error ? <p className="form-error">{error}</p> : null}</Modal>
    <Modal open={Boolean(transferSource)} title={`Pindahkan Kelas ${transferSource?.name ?? ''}`} onClose={() => !saving && setTransferSource(null)} wide footer={<><button className="button outline" onClick={() => setTransferSource(null)}>Batal</button><button className="button primary" disabled={saving} onClick={() => void submitTransfer()}>Pindahkan Kelas</button></>}><label className="field"><span>Admin tujuan</span><select value={transferTargetId} onChange={(event) => setTransferTargetId(event.target.value)}><option value="">Pilih Admin tujuan</option>{activeAdmins.filter((admin) => admin.id !== transferSource?.id).map((admin) => <option value={admin.id} key={admin.id}>{admin.name}</option>)}</select></label><fieldset className="admin-class-fieldset"><legend>Kelas yang dipindahkan</legend><div className="admin-class-picker">{transferSource?.assignedClassIds.map((classId) => { const studyClass=classes.find((item)=>item.id===classId); const selected=transferClassIds.includes(classId); return <label className={`class-check ${selected?'selected':''}`} key={classId}><input type="checkbox" checked={selected} onChange={() => toggleTransferClass(classId)} /><span className="class-check-box">{selected?'✓':''}</span><span>{studyClass?.name ?? 'Kelas'}</span></label> })}</div></fieldset>{error ? <p className="form-error">{error}</p> : null}</Modal>
  </>
}
