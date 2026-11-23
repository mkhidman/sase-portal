import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarDays, Link2Off, Users } from 'lucide-react'
import { fetchWaliView } from '../data/repository'
import { ATTENDANCE_LABELS } from '../lib/constants'
import { formatDate, materialDisplayName, monthLabel, percentage } from '../lib/utils'
import type { WaliAttendanceRecord, WaliMember, WaliView } from '../types/domain'

const STATUS_TONE: Record<string, string> = {
  present: 'success',
  excused: 'info',
  sick: 'warning',
  absent: 'danger',
}

function byMonth(records: WaliAttendanceRecord[]): [string, WaliAttendanceRecord[]][] {
  const groups = new Map<string, WaliAttendanceRecord[]>()
  records.forEach((record) => {
    const month = record.tanggal.slice(0, 7)
    groups.set(month, [...(groups.get(month) ?? []), record])
  })
  return [...groups.entries()].sort((left, right) => right[0].localeCompare(left[0]))
}

function MemberCard({ member }: { member: WaliMember }) {
  const hadir = member.absensi.filter((item) => item.status === 'present').length
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
        {member.absensi.length ? (
          <span className="badge muted">{percentage(hadir, member.absensi.length)}% hadir</span>
        ) : null}
      </div>
      {months.length ? months.map(([month, records]) => (
        <div className="wali-month" key={month}>
          <h3>{monthLabel(month)}</h3>
          {records.map((record) => (
            <div className="wali-row" key={`${record.tanggal}-${record.materiTipe}-${record.materiNama}`}>
              <span>
                <strong>{formatDate(record.tanggal)}</strong>
                <small>{materialDisplayName(record.materiTipe, record.materiNama)}</small>
              </span>
              <span className={`badge ${STATUS_TONE[record.status] ?? 'muted'}`}>{ATTENDANCE_LABELS[record.status]}</span>
            </div>
          ))}
        </div>
      )) : (
        <div className="empty-state">
          <span className="empty-state-icon"><CalendarDays size={20} /></span>
          <strong>Belum ada catatan absensi</strong>
          <p>Belum ada pengajian yang tercatat untuk {member.nama} dalam tiga bulan terakhir.</p>
        </div>
      )}
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

  return (
    <main className="wali-page">
      <header className="wali-header">
        <span className="brand-mark">SP</span>
        <div>
          <strong>Absensi Keluarga</strong>
          <small>{view.wali} · {view.anggota.length} orang · sejak {formatDate(view.sejak)}</small>
        </div>
      </header>
      {view.anggota.map((member, index) => <MemberCard key={`${index}-${member.nama}`} member={member} />)}
      <footer className="wali-footer">
        <Users size={14} /> Halaman ini hanya menampilkan anggota keluarga Anda. Hubungi pengurus bila ada data yang keliru.
      </footer>
    </main>
  )
}
