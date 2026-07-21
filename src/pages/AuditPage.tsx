import { Activity, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader, Person, StatCard } from '../components/UI'
import { useData } from '../contexts/DataContext'
import { formatDateTime } from '../lib/utils'
import type { AuditAction } from '../types/domain'

const ACTION_LABELS: Record<AuditAction, string> = {
  insert: 'Tambah',
  update: 'Ubah',
  delete: 'Hapus',
}

const ENTITY_LABELS: Record<string, string> = {
  jamaah: 'Data jamaah',
  schedules: 'Jadwal',
  attendance_sessions: 'Sesi absensi',
  material_completions: 'Ketuntasan materi',
  admin_class_assignments: 'Penugasan Admin',
  reporting_periods: 'Periode laporan',
  class_membership_history: 'Riwayat kelas',
  jamaah_status_history: 'Status jamaah',
}

export function AuditPage() {
  const { auditLogs } = useData()
  const [search, setSearch] = useState('')
  const [action, setAction] = useState<'all' | AuditAction>('all')

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return auditLogs.filter((item) => {
      const matchesAction = action === 'all' || item.action === action
      const matchesSearch = !needle || [item.actorName, item.actorEmail, item.summary, item.entityType]
        .join(' ')
        .toLowerCase()
        .includes(needle)
      return matchesAction && matchesSearch
    })
  }, [action, auditLogs, search])

  const today = new Date().toISOString().slice(0, 10)
  const todayCount = auditLogs.filter((item) => item.createdAt.slice(0, 10) === today).length
  const uniqueActors = new Set(auditLogs.map((item) => item.actorId ?? item.actorName)).size

  return (
    <>
      <PageHeader
        title="Riwayat Aktivitas"
        description="Jejak perubahan penting pada data sensus, jadwal, absensi, materi, tindak lanjut, periode laporan, perubahan kelas, status/arsip jamaah, dan penugasan Admin."
      />

      <section className="stats-grid three-columns compact-stats">
        <StatCard label="Aktivitas Tersimpan" value={auditLogs.length} note="Maksimal 200 aktivitas terbaru" icon={<Activity size={20} />} />
        <StatCard label="Aktivitas Hari Ini" value={todayCount} note="Berdasarkan waktu perangkat" icon={<span>H</span>} />
        <StatCard label="Pengguna Terlibat" value={uniqueActors} note="Admin dan Superadmin" icon={<span>U</span>} />
      </section>

      <article className="card">
        <div className="toolbar">
          <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari pengguna atau aktivitas…" /></label>
          <select value={action} onChange={(event) => setAction(event.target.value as 'all' | AuditAction)}>
            <option value="all">Semua tindakan</option>
            <option value="insert">Tambah</option>
            <option value="update">Ubah</option>
            <option value="delete">Hapus</option>
          </select>
        </div>

        <div className="audit-list">
          {filtered.map((item) => (
            <article className="audit-row" key={item.id}>
              <Person name={item.actorName || 'Sistem'} meta={item.actorEmail || 'Aktivitas sistem'} />
              <div className="audit-copy">
                <strong>{item.summary}</strong>
                <small>{ENTITY_LABELS[item.entityType] ?? item.entityType} · {formatDateTime(item.createdAt)}</small>
              </div>
              <span className={`badge ${item.action === 'insert' ? 'success' : item.action === 'delete' ? 'danger' : 'info'}`}>
                {ACTION_LABELS[item.action]}
              </span>
            </article>
          ))}
          {!filtered.length ? <div className="empty-state">Belum ada aktivitas yang sesuai filter.</div> : null}
        </div>
      </article>
    </>
  )
}
