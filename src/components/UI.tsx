import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { initials } from '../lib/utils'
import type { Feedback } from '../lib/feedback'

export function InlineMessage({ value, className = '' }: { value: Feedback | null; className?: string }) {
  if (!value) return null
  return (
    <div className={`inline-message ${value.tone} ${className}`.trim()} role={value.tone === 'error' ? 'alert' : 'status'}>
      {value.text}
    </div>
  )
}

/** Nada tint ikon stat. Keempatnya sudah diperiksa kontras >= 4,5:1 di styles.css. */
export type StatTone = 'mint' | 'sky' | 'violet' | 'amber'

/**
 * Chip tren pada stat tile.
 *
 * Isi `label` HANYA dengan angka pembanding yang betul-betul dihitung dari data
 * dua periode. Jangan mengarang tren: stat tile dipakai pengurus untuk mengambil
 * keputusan, dan "naik 12,5%" yang tidak berdasar lebih berbahaya daripada tidak
 * menampilkan apa pun. Bila tidak ada pembanding, cukup kosongkan dan pakai `note`.
 */
export type StatDelta = { label: string; direction: 'up' | 'down' | 'flat' }

export function StatCard({ label, value, note, icon, tone = 'mint', delta }: {
  label: string
  value: string | number
  note: string
  icon: ReactNode
  tone?: StatTone
  delta?: StatDelta
}) {
  return (
    <article className="card stat-card">
      <span className="stat-icon" data-tone={tone}>{icon}</span>
      <div>
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        {delta ? (
          <span className={`stat-delta ${delta.direction}`}>
            {delta.direction === 'up' ? <ArrowUpRight size={12} aria-hidden /> : null}
            {delta.direction === 'down' ? <ArrowDownRight size={12} aria-hidden /> : null}
            {delta.label}
          </span>
        ) : null}
        <small>{note}</small>
      </div>
    </article>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon ? <span className="empty-state-icon">{icon}</span> : null}
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  )
}

export function PageNotice({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <article className="card page-notice">
      <span className="page-notice-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="page-notice-action">{action}</div> : null}
    </article>
  )
}

export function Person({ name, meta }: { name: string; meta: string }) {
  return (
    <div className="person">
      <span className="avatar">{initials(name)}</span>
      <span>
        <strong>{name}</strong>
        <small>{meta}</small>
      </span>
    </div>
  )
}

export function ProgressBlock({ title, percent, done, total }: { title: string; percent: number; done: number; total: number }) {
  return (
    <article className="progress-block">
      <div className="progress-heading">
        <div>
          <strong>{title}</strong>
          <small>Target ketuntasan bulanan</small>
        </div>
        <span className={`badge ${percent === 100 ? 'success' : 'warning'}`}>{percent}%</span>
      </div>
      <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
      <div className="progress-meta"><span>{done} dari {total} selesai</span><span>{Math.max(total - done, 0)} belum tuntas</span></div>
    </article>
  )
}
