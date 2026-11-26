import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarDays, Link2Off, Users } from 'lucide-react'
import { fetchWaliView } from '../data/repository'
import { ATTENDANCE_LABELS, ATTENDANCE_OPTIONS } from '../lib/constants'
import { attendanceCounts, formatDate, materialDisplayName, monthLabel, percentage } from '../lib/utils'
import { waliRangeLabel } from '../lib/wali'
import type { WaliAttendanceRecord, WaliMember, WaliView } from '../types/domain'

const STATUS_TONE: Record<string, string> = {
  present: 'success',
  excused: 'info',
  sick: 'warning',
  absent: 'danger',
}

// Bukan token status (--warning dan --danger terlalu mirip sebagai bidang isian dan tidak
// terbedakan pada buta warna deutan). Empat bidang warna juga tidak pernah berdiri sendiri:
// angka dan namanya selalu ikut ditulis di legenda.
const STATUS_COLOR: Record<string, string> = {
  present: 'var(--chart-series-1)',
  excused: 'var(--chart-series-2)',
  sick: 'var(--chart-series-3)',
  absent: 'var(--chart-series-4)',
}

function countsOf(records: WaliAttendanceRecord[]) {
  return attendanceCounts(Object.fromEntries(records.map((record, index) => [String(index), record.status])))
}

function statusSummary(counts: Record<string, number>): string {
  return ATTENDANCE_OPTIONS.filter((status) => counts[status]).map((status) => `${counts[status]} ${ATTENDANCE_LABELS[status].toLowerCase()}`).join(' · ')
}

function byMonth(records: WaliAttendanceRecord[]): [string, WaliAttendanceRecord[]][] {
  const groups = new Map<string, WaliAttendanceRecord[]>()
  records.forEach((record) => {
    const month = record.tanggal.slice(0, 7)
    groups.set(month, [...(groups.get(month) ?? []), record])
  })
  return [...groups.entries()].sort((left, right) => right[0].localeCompare(left[0]))
}

function MemberCard({ member, rangeLabel }: { member: WaliMember; rangeLabel: string }) {
  const counts = countsOf(member.absensi)
  const total = member.absensi.length
  const months = byMonth(member.absensi)

  return (
    <section className="card wali-member">
      <div className="card-heading">
        <div>
          <h2>{member.nama}</h2>
          <p>{member.kelas || 'Belum terdaftar di kelas mana pun'}</p>
        </div>
        {/* Nada sengaja netral: di aplikasi ini warna persentase berasal dari tingkat risiko
            (hitungan alpa), bukan dari angka persennya. Mewarnai di sini akan jadi definisi
            kedua tentang "kehadiran buruk" yang bisa berbeda dari halaman Tindak Lanjut. */}
        {total ? <span className="badge muted">{percentage(counts.present, total)}% hadir</span> : null}
      </div>
      {total ? (
        <div className="composition wali-breakdown">
          <div className="composition-split" role="img" aria-label={`${total} pengajian: ${statusSummary(counts)}.`}>
            {ATTENDANCE_OPTIONS.map((status) => counts[status]
              ? <span key={status} style={{ flexGrow: counts[status], background: STATUS_COLOR[status] }} />
              : null)}
          </div>
          <ul className="composition-legend">
            {ATTENDANCE_OPTIONS.map((status) => (
              <li key={status}>
                <span className="composition-swatch" style={{ background: STATUS_COLOR[status] }} />
                {ATTENDANCE_LABELS[status]} <strong>{counts[status]} · {percentage(counts[status], total)}%</strong>
              </li>
            ))}
            <li className="composition-legend-total">Total pengajian <strong>{total}</strong></li>
          </ul>
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-state-icon"><CalendarDays size={20} /></span>
          <strong>Belum ada catatan absensi</strong>
          <p>Belum ada pengajian yang tercatat untuk {member.nama}{rangeLabel ? ` pada ${rangeLabel}` : ''}.</p>
        </div>
      )}
      {/* Tanggalnya dilipat, bukan dibuang: angka rekap tidak bisa dipakai orang tua untuk
          menanyakan ketidakhadiran tertentu ke pengurus, dan di sinilah satu-satunya tempat
          data itu terlihat. */}
      {months.map(([month, records]) => (
        <details className="wali-month" key={month}>
          <summary>
            <strong>{monthLabel(month)}</strong>
            <small>{records.length} pengajian · {statusSummary(countsOf(records))}</small>
          </summary>
          {records.map((record) => (
            <div className="wali-row" key={`${record.tanggal}-${record.materiTipe}-${record.materiNama}`}>
              <span>
                <strong>{formatDate(record.tanggal)}</strong>
                <small>{materialDisplayName(record.materiTipe, record.materiNama)}</small>
              </span>
              <span className={`badge ${STATUS_TONE[record.status] ?? 'muted'}`}>{ATTENDANCE_LABELS[record.status]}</span>
            </div>
          ))}
        </details>
      ))}
    </section>
  )
}

export function WaliPage() {
  const { token = '' } = useParams()
  const [view, setView] = useState<WaliView | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid' | 'error'>('loading')

  useEffect(() => {
    let active = true
    setStatus('loading')
    fetchWaliView(token)
      .then((result) => {
        if (!active) return
        setView(result)
        setStatus(result ? 'ready' : 'invalid')
      })
      .catch(() => { if (active) setStatus('error') })
    return () => { active = false }
  }, [token])

  if (status === 'loading') return <div className="loading-screen">Memuat data absensi…</div>

  if (status !== 'ready' || !view) {
    const broken = status === 'invalid'
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="empty-state">
            <span className="empty-state-icon"><Link2Off size={20} /></span>
            <strong>{broken ? 'Tautan tidak berlaku' : 'Data tidak dapat dimuat'}</strong>
            <p>
              {broken
                ? 'Tautan ini sudah dicabut atau salah ketik. Silakan hubungi pengurus untuk meminta tautan baru.'
                : 'Periksa koneksi internet Anda, lalu muat ulang halaman ini.'}
            </p>
          </div>
        </section>
      </main>
    )
  }

  // sampai bisa kosong bila migration rentang belum dijalankan; label jatuh ke tanggal mulai.
  const rangeLabel = view.sampai ? waliRangeLabel(view.sejak, view.sampai) : `sejak ${formatDate(view.sejak)}`

  return (
    <main className="wali-page">
      <header className="wali-header">
        <img className="brand-mark" src="/logo.jpg" alt="" />
        <div>
          <strong>Absensi Keluarga</strong>
          <small>{view.wali} · {view.anggota.length} orang{rangeLabel ? ` · ${rangeLabel}` : ''}</small>
        </div>
      </header>
      {view.anggota.map((member, index) => <MemberCard key={`${index}-${member.nama}`} member={member} rangeLabel={rangeLabel} />)}
      <footer className="wali-footer">
        <Users size={14} /> Halaman ini hanya menampilkan anggota keluarga Anda. Hubungi pengurus bila ada data yang keliru.
      </footer>
    </main>
  )
}
