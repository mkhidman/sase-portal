import type { ReactNode } from 'react'
import { percentage } from '../lib/utils'

export interface GenderCompositionRow {
  key: string
  label: string
  male: number
  female: number
  total: number
  /** Menyisipkan subjudul sebelum baris ini ketika berbeda dari baris sebelumnya. */
  groupLabel?: string
}

// Laki-laki dan Perempuan hanya dibedakan warna, jadi angkanya selalu ikut ditulis:
// tanpa itu grafik ini tidak terbaca pada layar monokrom maupun bagi pengguna buta warna.
const MALE = 'var(--chart-series-1)'
const FEMALE = 'var(--chart-series-2)'

interface GenderCompositionProps {
  rows: GenderCompositionRow[]
  /** Dibedakan karena satu warga dapat tercatat pada lebih dari satu kelas. */
  totalLabel?: string
  footnote?: ReactNode
}

export function GenderComposition({ rows, totalLabel = 'Total warga aktif', footnote }: GenderCompositionProps) {
  const male = rows.reduce((sum, row) => sum + row.male, 0)
  const female = rows.reduce((sum, row) => sum + row.female, 0)
  const total = male + female
  if (!total) return <div className="empty-state">Belum ada warga aktif untuk ditampilkan.</div>

  const largest = Math.max(...rows.map((row) => row.total))

  return (
    <div className="composition">
      <div
        className="composition-split"
        role="img"
        aria-label={`${totalLabel}: ${male} laki-laki dan ${female} perempuan dari ${total}.`}
      >
        {male ? <span style={{ flexGrow: male, background: MALE }} /> : null}
        {female ? <span style={{ flexGrow: female, background: FEMALE }} /> : null}
      </div>
      <ul className="composition-legend">
        <li>
          <span className="composition-swatch" style={{ background: MALE }} />
          Laki-laki <strong>{male} · {percentage(male, total)}%</strong>
        </li>
        <li>
          <span className="composition-swatch" style={{ background: FEMALE }} />
          Perempuan <strong>{female} · {percentage(female, total)}%</strong>
        </li>
        <li className="composition-legend-total">
          {totalLabel} <strong>{total}</strong>
        </li>
      </ul>

      <div className="composition-rows">
        {rows.map((row, index) => (
          <div className="composition-entry" key={row.key}>
            {row.groupLabel && row.groupLabel !== rows[index - 1]?.groupLabel ? (
              <div className="composition-group">{row.groupLabel}</div>
            ) : null}
            <div className="composition-row">
              <span className="composition-label">{row.label}</span>
              <span className="composition-track">
                {row.total ? (
                  <span className="composition-fill" style={{ width: `${percentage(row.total, largest)}%` }}>
                    {row.male ? <span style={{ flexGrow: row.male, background: MALE }} /> : null}
                    {row.female ? <span style={{ flexGrow: row.female, background: FEMALE }} /> : null}
                  </span>
                ) : null}
              </span>
              <span className="composition-value">
                {row.total ? <>L {row.male} · P {row.female} · <strong>{row.total}</strong></> : <em>Belum ada</em>}
              </span>
            </div>
          </div>
        ))}
      </div>

      {footnote ? <p className="composition-footnote">{footnote}</p> : null}
    </div>
  )
}
