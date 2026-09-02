import type { ReactNode } from 'react'

export interface ChartSeries {
  key: string
  label: string
  color: string
}

export interface StackedColumn {
  key: string
  label: string
  fullLabel: string
  total: number
  values: Record<string, number>
  capLabel: string
}

export interface BarItem {
  key: string
  label: string
  value: number
  caption: string
  color: string
}

export interface GroupedBarRow {
  key: string
  label: string
  bars: Array<{ seriesKey: string; percent: number; caption: string; empty?: boolean }>
}

export function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <ul className="chart-legend">
      {series.map((item) => (
        <li key={item.key}>
          <span className="chart-swatch" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export function ChartTable({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <details className="chart-table">
      <summary>Lihat sebagai tabel</summary>
      <div className="chart-table-scroll">
        <table>
          <thead>
            <tr>{head.map((cell) => <th key={cell}>{cell}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[0])}>
                {row.map((cell, index) => (index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

// Kolom bertumpuk 100%: tinggi tiap segmen mengikuti proporsi, bukan jumlah mutlak,
// supaya bulan dengan jumlah sesi berbeda tetap bisa dibandingkan.
export function StackedColumnChart({ columns, series }: { columns: StackedColumn[]; series: ChartSeries[] }) {
  return (
    <div className="chart-columns" role="img" aria-label="Komposisi kehadiran per bulan">
      {columns.map((column) => (
        <div className="chart-column" key={column.key}>
          <span className="chart-column-cap">{column.total ? column.capLabel : '—'}</span>
          <div className="chart-column-track">
            {column.total ? (
              <div className="chart-column-stack">
                {[...series].reverse().map((item) => {
                  const value = column.values[item.key] ?? 0
                  if (!value) return null
                  return (
                    <span
                      key={item.key}
                      style={{ flexGrow: value, background: item.color }}
                      title={`${column.fullLabel} · ${item.label}: ${value}`}
                    />
                  )
                })}
              </div>
            ) : (
              <div className="chart-column-stack empty" title={`${column.fullLabel} · belum ada sesi`} />
            )}
          </div>
          <span className="chart-column-label">{column.label}</span>
        </div>
      ))}
    </div>
  )
}

export function SplitBar({ slices }: { slices: BarItem[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  if (!total) return <div className="empty-state">Belum ada data warga.</div>

  return (
    <div className="chart-split">
      <div className="chart-split-track">
        {slices.map((slice) => (slice.value ? (
          <span
            key={slice.key}
            style={{ flexGrow: slice.value, background: slice.color }}
            title={`${slice.label}: ${slice.caption}`}
          />
        ) : null))}
      </div>
      <ul className="chart-legend spread">
        {slices.map((slice) => (
          <li key={slice.key}>
            <span className="chart-swatch" style={{ background: slice.color }} />
            {slice.label}
            <strong>{slice.caption}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function BarList({ items }: { items: BarItem[] }) {
  const max = items.reduce((highest, item) => Math.max(highest, item.value), 0)
  if (!max) return <div className="empty-state">Belum ada data untuk ditampilkan.</div>

  return (
    <div className="chart-bars">
      {items.map((item) => (
        <div className="chart-bar-row" key={item.key}>
          <span className="chart-bar-label">{item.label}</span>
          <span className="chart-bar-track">
            <span style={{ width: `${Math.max((item.value / max) * 100, 2)}%`, background: item.color }} />
          </span>
          <span className="chart-bar-value">{item.caption}</span>
        </div>
      ))}
    </div>
  )
}

export function GroupedBarList({ rows, series }: { rows: GroupedBarRow[]; series: ChartSeries[] }) {
  const colorFor = new Map(series.map((item) => [item.key, item.color]))

  return (
    <div className="chart-groups">
      {rows.map((row) => (
        <div className="chart-group" key={row.key}>
          <span className="chart-group-label">{row.label}</span>
          <div className="chart-group-bars">
            {row.bars.map((bar) => (
              <div className="chart-bar-row" key={bar.seriesKey}>
                <span className={`chart-bar-track slim${bar.empty ? ' blank' : ''}`}>
                  {bar.empty ? null : <span style={{ width: `${bar.percent}%`, background: colorFor.get(bar.seriesKey) }} />}
                </span>
                <span className="chart-bar-value">{bar.caption}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ChartCard({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <article className="card chart-card">
      <div className="card-heading">
        <div><h2>{title}</h2><p>{description}</p></div>
        {actions}
      </div>
      {children}
    </article>
  )
}
