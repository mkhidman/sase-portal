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

export function StatCard({ label, value, note, icon }: { label: string; value: string | number; note: string; icon: ReactNode }) {
  return (
    <article className="card stat-card">
      <div>
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        <small>{note}</small>
      </div>
      <span className="stat-icon">{icon}</span>
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
