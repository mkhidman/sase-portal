import type { ReactNode } from 'react'
import { initials } from '../lib/utils'

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
