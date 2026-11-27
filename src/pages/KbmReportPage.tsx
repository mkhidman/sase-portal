import { CalendarCheck2, Copy, ExternalLink, FileText, GraduationCap, Link2Off, Share2, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MonthField } from '../components/MonthField'
import { PageHeader, StatCard } from '../components/UI'
import { InlineMessage } from '../components/UI'
import { useData } from '../contexts/DataContext'
import { publishKbmReport, revokeKbmReport } from '../data/repository'
import { feedbackFrom, feedbackOk, type Feedback } from '../lib/feedback'
import { CLASS_PROGRESSION } from '../lib/constants'
import { buildKbmReport } from '../lib/kbmReport'
import { downloadKbmReportPdf } from '../lib/kbmReportPdf'
import { jamaahSnapshotsAsOfDate, monthEndDate, monthLabel, monthValue } from '../lib/utils'

/**
 * Kelas pembinaan generus: Playgroup sampai Pra Nikah. Diturunkan dari alur
 * kenaikan kelas yang sudah ada, bukan daftar nama yang ditulis ulang di sini --
 * menambah kelas baru ke alurnya otomatis ikut terbawa ke laporan ini.
 */
const GENERUS_CLASS_NAMES = new Set([...Object.keys(CLASS_PROGRESSION), ...Object.values(CLASS_PROGRESSION)])

export function KbmReportPage() {
  const { visibleClasses, jamaah, classHistory, statusHistory, attendanceSessions } = useData()
  const [month, setMonth] = useState(() => monthValue())
  const [allClasses, setAllClasses] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [shareToken, setShareToken] = useState('')
  const [message, setMessage] = useState<Feedback | null>(null)

  // Tautan menyimpan hasil laporan, bukan izin baca tabel: angka yang sudah
  // dibagikan ke orang tua tidak boleh berubah sendiri ketika absensi bulan itu
  // dikoreksi kemudian. Menerbitkan ulang adalah tindakan sadar.
  async function publish() {
    setPublishing(true)
    setMessage(null)
    try {
      const token = await publishKbmReport(month, reports)
      setShareToken(token)
      setMessage(feedbackOk('Laporan diterbitkan. Salin tautannya untuk dibagikan ke orang tua.'))
    } catch (cause) {
      setMessage(feedbackFrom(cause, 'Gagal menerbitkan laporan.'))
    } finally {
      setPublishing(false)
    }
  }

  async function revoke() {
    setPublishing(true)
    try {
      await revokeKbmReport(month)
      setShareToken('')
      setMessage(feedbackOk('Tautan laporan dicabut. Yang sudah dibagikan tidak bisa dibuka lagi.'))
    } catch (cause) {
      setMessage(feedbackFrom(cause, 'Gagal mencabut tautan.'))
    } finally {
      setPublishing(false)
    }
  }

  // Potret akhir bulan, bukan data hari ini: generus yang naik kelas sesudahnya
  // harus tetap muncul di kelas lamanya pada laporan bulan itu.
  const snapshotJamaah = useMemo(
    () => jamaahSnapshotsAsOfDate(jamaah, classHistory, statusHistory, monthEndDate(month)),
    [classHistory, jamaah, month, statusHistory],
  )

  const selectedClasses = useMemo(
    () => allClasses ? visibleClasses : visibleClasses.filter((item) => GENERUS_CLASS_NAMES.has(item.name)),
    [allClasses, visibleClasses],
  )

  // Kelas tanpa pertemuan pada bulan itu tidak dicetak: laporan ini dibacakan ke
  // orang tua, dan kartu kosong hanya jadi pertanyaan yang tidak perlu dijawab.
  const reports = useMemo(
    () => buildKbmReport(selectedClasses, snapshotJamaah, attendanceSessions, month)
      .filter((report) => report.sessions > 0 && report.members.length > 0),
    [attendanceSessions, month, selectedClasses, snapshotJamaah],
  )

  const totalSessions = reports.reduce((sum, report) => sum + report.sessions, 0)
  // Satu generus bisa terdaftar di beberapa kelas; dihitung sekali.
  const totalMembers = new Set(reports.flatMap((report) => report.members.map((row) => row.jamaahId))).size
  const overall = reports.length
    ? Math.round(reports.reduce((sum, report) => sum + report.averagePercent, 0) / reports.length)
    : 0

  return (
    <>
      <PageHeader
        title="Laporan Pencapaian KBM"
        actions={<>
          <MonthField value={month} onChange={setMonth} />
          <button className="button outline" type="button" disabled={!reports.length || publishing} onClick={() => void publish()}>
            <Share2 size={16} /> {publishing ? 'Menerbitkan…' : 'Terbitkan Tautan'}
          </button>
          <button className="button primary" type="button" disabled={!reports.length} onClick={() => downloadKbmReportPdf({ month, monthLabel: monthLabel(month), reports }, `laporan-kbm-${month}.pdf`)}>
            <FileText size={16} /> Ekspor PDF
          </button>
        </>}
      />

      <InlineMessage value={message} className="page-message" />

      {shareToken ? (
        <article className="card kbm-share">
          <div>
            <strong>Tautan publik {monthLabel(month)}</strong>
            <code>{`${window.location.origin}/kbm/${shareToken}`}</code>
          </div>
          <div className="button-row">
            <button className="button soft small" type="button" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/kbm/${shareToken}`).then(() => setMessage(feedbackOk('Tautan disalin.')))}><Copy size={14} /> Salin</button>
            <a className="button soft small" href={`/kbm/${shareToken}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Buka</a>
            <button className="button outline small" type="button" disabled={publishing} onClick={() => void revoke()}><Link2Off size={14} /> Cabut</button>
          </div>
        </article>
      ) : null}

      <label className={`switch-card kbm-scope ${allClasses ? 'selected' : ''}`}>
        <input type="checkbox" checked={allClasses} onChange={(event) => setAllClasses(event.target.checked)} />
        <span><strong>Tampilkan semua kelas</strong><small>Bawaannya hanya kelas pembinaan generus (Playgroup sampai Pra Nikah). Centang untuk ikut menampilkan Pengajian Umum, 5 Unsur, dan kelas lainnya.</small></span>
      </label>

      <section className="stats-grid three-columns">
        <StatCard tone="sky" label="Jumlah Pertemuan" value={totalSessions} icon={<CalendarCheck2 size={20} />} />
        <StatCard tone="mint" label="Rata-Rata Kehadiran" value={`${overall}%`} icon={<Users size={20} />} />
        <StatCard tone="violet" label="Generus Dilaporkan" value={totalMembers} icon={<GraduationCap size={20} />} />
      </section>

      {reports.map((report) => (
        <article className="card kbm-class-card" key={report.classId}>
          <div className="card-heading">
            <div><h2>{report.className}</h2></div>
            <div className="kbm-class-meta">
              <span><small>Jumlah pertemuan</small><strong>{report.sessions} TM</strong></span>
              <span><small>Rata-rata kelas</small><strong>{report.averagePercent}%</strong></span>
            </div>
          </div>
          {report.sessions ? (
            <div className="kbm-chart" role="list">
              {report.members.map((row) => (
                <div className="kbm-bar" role="listitem" key={row.jamaahId} title={`${row.fullName}: hadir ${row.present} dari ${row.recorded} pencatatan`}>
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
          ) : (
            <div className="empty-state">Belum ada sesi absensi tercatat pada bulan ini.</div>
          )}
        </article>
      ))}

      {!reports.length ? (
        <article className="card">
          <div className="empty-state">Belum ada sesi absensi tercatat pada bulan {monthLabel(month)}.</div>
        </article>
      ) : null}
    </>
  )
}
