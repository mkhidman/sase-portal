import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchPublishedKbmReport, type PublishedKbmReport } from '../data/repository'
import { formatDateTime, monthLabel } from '../lib/utils'

/**
 * Halaman publik laporan KBM. Sengaja di luar ProtectedRoute dan TIDAK memakai
 * useData: kalau orang tua masuk lewat bootstrap biasa, satu kunjungan
 * mengunduh seluruh tabel ke HP orang luar dan mengendapkannya di cache
 * offline. Datanya hanya dari RPC kbm_report, dan tokennya tidak pernah ikut
 * bootstrap.
 */
export function KbmPublicPage() {
  const { token = '' } = useParams()
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [data, setData] = useState<PublishedKbmReport | null>(null)

  useEffect(() => {
    let active = true
    fetchPublishedKbmReport(token)
      .then((result) => {
        if (!active) return
        setData(result)
        setState(result ? 'ready' : 'missing')
      })
      .catch(() => active && setState('error'))
    return () => { active = false }
  }, [token])

  if (state === 'loading') return <main className="wali-page"><div className="empty-state">Memuat laporan…</div></main>
  if (state === 'error') return <main className="wali-page"><div className="empty-state">Laporan tidak dapat dimuat. Periksa koneksi lalu muat ulang halaman.</div></main>
  if (state === 'missing' || !data) return <main className="wali-page"><div className="empty-state">Tautan laporan tidak dikenali atau sudah dicabut. Hubungi pengurus untuk tautan terbaru.</div></main>

  return (
    <main className="wali-page">
      <header className="wali-header">
        <img className="brand-mark" src="/logo.jpg" alt="" />
        <div>
          <strong>Laporan Pencapaian KBM</strong>
          <small>{monthLabel(data.month)} · diterbitkan {formatDateTime(data.publishedAt)}</small>
        </div>
      </header>

      {data.report.map((report) => (
        <article className="card kbm-class-card" key={report.classId}>
          <div className="card-heading">
            <div><h2>{report.className}</h2></div>
            <div className="kbm-class-meta">
              <span><small>Jumlah pertemuan</small><strong>{report.sessions} TM</strong></span>
              <span><small>Rata-rata kelas</small><strong>{report.averagePercent}%</strong></span>
            </div>
          </div>
          <div className="kbm-chart" role="list">
            {report.members.map((row) => (
              <div className="kbm-bar" role="listitem" key={row.jamaahId}>
                <div className="kbm-bar-track">
                  <div className={`kbm-bar-fill ${row.percent >= 80 ? 'good' : row.percent >= 60 ? 'warn' : 'low'}`} style={{ height: `${row.recorded ? Math.max(row.percent, 4) : 0}%` }}>
                    {row.recorded ? <span>{row.percent}%</span> : null}
                  </div>
                </div>
                <small>{row.fullName}</small>
                {!row.recorded ? <em>belum tercatat</em> : null}
              </div>
            ))}
          </div>
        </article>
      ))}

      {!data.report.length ? <div className="empty-state">Belum ada kelas yang dilaporkan pada bulan ini.</div> : null}
    </main>
  )
}
