import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { useConfirm } from './useConfirm'
import { InlineMessage, Person } from './UI'
import { useData } from '../contexts/DataContext'
import { FOLLOW_UP_STATUS_LABELS } from '../lib/constants'
import { feedbackFrom, feedbackOk, type Feedback } from '../lib/feedback'
import type { AttendanceRisk } from '../lib/followUps'
import type { FollowUpStatus, JamaahFollowUp } from '../types/domain'

const STATUS_OPTIONS: FollowUpStatus[] = ['pending', 'contacted', 'visit_needed', 'resolved']

export function FollowUpModal({ risk, className, onClose, onSaved }: {
  risk: AttendanceRisk | null
  className: string
  onClose: () => void
  onSaved?: (message: Feedback) => void
}) {
  const { saveJamaahFollowUp, deleteJamaahFollowUp, isPeriodClosed } = useData()
  const [form, setForm] = useState({ status: 'pending' as FollowUpStatus, notes: '', nextFollowUpDate: '' })
  const [message, setMessage] = useState<Feedback | null>(null)
  const [working, setWorking] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirm()

  // Kunci orang, bukan objek risk-nya: risk disusun ulang tiap kali halaman
  // induknya render, jadi menggantungkan efek ini pada objeknya akan menghapus
  // catatan yang sedang diketik setiap kali data disegarkan dari Realtime.
  const riskKey = risk ? `${risk.classId}-${risk.jamaah.id}-${risk.month}` : ''
  useEffect(() => {
    if (!risk) return
    setForm({
      status: risk.followUp?.status ?? 'pending',
      notes: risk.followUp?.notes ?? '',
      nextFollowUpDate: risk.followUp?.nextFollowUpDate ?? '',
    })
    setMessage(null)
  }, [riskKey])

  const periodClosed = risk ? isPeriodClosed(risk.month) : false

  async function save() {
    if (!risk) return
    setWorking(true)
    setMessage(null)
    try {
      const now = new Date().toISOString()
      const followUp: JamaahFollowUp = {
        id: risk.followUp?.id ?? `new-${crypto.randomUUID()}`,
        jamaahId: risk.jamaah.id,
        classId: risk.classId,
        periodMonth: risk.month,
        status: form.status,
        triggerType: risk.consecutiveAbsence >= 4 ? 'consecutive_absence' : 'manual',
        attendanceRate: risk.attendanceRate,
        absenceCount: risk.absentCount,
        consecutiveAbsence: risk.consecutiveAbsence,
        notes: form.notes.trim(),
        nextFollowUpDate: form.status === 'resolved' ? '' : form.nextFollowUpDate,
        recordedBy: risk.followUp?.recordedBy ?? null,
        createdAt: risk.followUp?.createdAt ?? now,
        updatedAt: now,
      }
      await saveJamaahFollowUp(followUp)
      onClose()
      onSaved?.(feedbackOk('Tindak lanjut berhasil disimpan.'))
    } catch (cause) {
      setMessage(feedbackFrom(cause, 'Gagal menyimpan tindak lanjut.'))
    } finally {
      setWorking(false)
    }
  }

  async function remove() {
    if (!risk?.followUp) return
    const approved = await confirm({
      title: 'Hapus catatan tindak lanjut?',
      description: `Catatan tindak lanjut untuk ${risk.jamaah.fullName} akan dihapus. Riwayat kehadirannya tidak ikut terhapus.`,
      confirmLabel: 'Hapus Catatan',
      tone: 'danger',
    })
    if (!approved) return
    setWorking(true)
    try {
      await deleteJamaahFollowUp(risk.followUp.id)
      onClose()
      onSaved?.(feedbackOk('Catatan tindak lanjut berhasil dihapus.'))
    } catch (cause) {
      setMessage(feedbackFrom(cause, 'Gagal menghapus tindak lanjut.'))
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <Modal open={Boolean(risk)} title="Catatan Tindak Lanjut" onClose={onClose} wide>
        {risk ? (
          <>
            <div className="followup-modal-summary">
              <Person name={risk.jamaah.fullName} meta={`${className} · Alpa ${risk.absentCount}`} />
              <div className="badge-list">{risk.reasons.map((reason) => <span className="badge warning" key={reason}>{reason}</span>)}</div>
            </div>
            {periodClosed ? <div className="notice danger-notice">Periode bulan ini sudah ditutup. Catatan tindak lanjut hanya dapat dilihat.</div> : null}
            <div className="form-grid one-column">
              <label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FollowUpStatus }))}>{STATUS_OPTIONS.map((status) => <option value={status} key={status}>{FOLLOW_UP_STATUS_LABELS[status]}</option>)}</select></label>
              <label>Tanggal tindak lanjut berikutnya<input type="date" disabled={form.status === 'resolved'} value={form.status === 'resolved' ? '' : form.nextFollowUpDate} onChange={(event) => setForm((current) => ({ ...current, nextFollowUpDate: event.target.value }))} /></label>
              <label>Catatan<textarea rows={5} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Contoh: sudah menghubungi wali, warga sedang sakit, rencana kunjungan…" /></label>
            </div>
            <InlineMessage value={message} />
            <div className="modal-inline-actions">
              {risk.followUp ? <button className="button danger" type="button" disabled={working || periodClosed} onClick={() => void remove()}><Trash2 size={15} /> Hapus Catatan</button> : <span />}
              <div><button className="button outline" type="button" onClick={onClose}>Batal</button><button className="button primary" type="button" disabled={working || periodClosed} onClick={() => void save()}>{working ? 'Menyimpan…' : 'Simpan Tindak Lanjut'}</button></div>
            </div>
          </>
        ) : null}
      </Modal>
      {confirmDialog}
    </>
  )
}
