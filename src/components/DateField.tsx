import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MonthGrid } from './MonthField'
import { createPortal } from 'react-dom'
import { usePickerPanel } from '../hooks/usePickerPanel'
import { buildMonthGrid, shiftMonth, WEEKDAY_LABELS } from '../lib/calendar'
import { formatDate, localIsoDate, monthLabel } from '../lib/utils'

type View = 'day' | 'month' | 'year'

const YEARS_PER_PAGE = 12

/**
 * Pengganti <input type="date">. Tiga tampilan bertingkat -- hari, bulan, tahun --
 * karena kalender yang hanya bisa maju-mundur per bulan membuat tanggal lahir
 * praktis tidak terjangkau: dari tahun ini ke 1987 saja hampir 500 ketukan.
 *
 * `min`/`max` diteruskan apa adanya dari pemanggilnya dan menonaktifkan selnya,
 * bukan sekadar menyembunyikan. Batas itu memikul aturan projek -- tanggal lahir
 * dan tanggal efektif tidak boleh di masa depan -- jadi kalau pemilihnya longgar,
 * tanggal mustahil masuk tanpa satu pun pesan di layar.
 */
export function DateField({ value, onChange, min, max, disabled }: {
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  disabled?: boolean
}) {
  const [view, setView] = useState<View>('day')
  const [month, setMonth] = useState(() => (value || localIsoDate()).slice(0, 7))
  const { open, setOpen, anchor, wrapper, panel, reposition } = usePickerPanel(350, 278)

  useEffect(() => { if (open) reposition() }, [open, view, reposition])

  useEffect(() => {
    if (!open) return
    setView('day')
    setMonth((value || localIsoDate()).slice(0, 7))
  }, [open, value])

  const year = Number(month.slice(0, 4))
  const yearPageStart = year - ((year % YEARS_PER_PAGE) + YEARS_PER_PAGE) % YEARS_PER_PAGE
  const today = localIsoDate()
  const outOfRange = (date: string) => Boolean((min && date < min) || (max && date > max))

  function pick(date: string) {
    onChange(date)
    setOpen(false)
  }

  return (
    <div className="picker-field" ref={wrapper}>
      <button
        type="button"
        className="picker-trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarDays size={15} />
        <span>{value ? formatDate(value) : 'Pilih tanggal'}</span>
        <ChevronDown size={14} className={open ? 'rotated' : ''} />
      </button>
      {open ? createPortal((
        <div className="picker-panel wide" ref={panel} style={anchor} role="dialog" aria-label="Pilih tanggal">
          {view === 'day' ? (
            <>
              <div className="picker-head">
                <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Bulan sebelumnya"><ChevronLeft size={16} /></button>
                <button type="button" className="picker-head-label" onClick={() => setView('month')}>{monthLabel(month)}</button>
                <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Bulan berikutnya"><ChevronRight size={16} /></button>
              </div>
              <div className="picker-grid weekdays" aria-hidden="true">
                {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
              </div>
              <div className="picker-grid days">
                {buildMonthGrid(month).map((date, index) => date === null
                  ? <span key={`pad-${index}`} />
                  : (
                    <button
                      type="button"
                      key={date}
                      disabled={outOfRange(date)}
                      className={`${date === value ? 'selected' : ''} ${date === today ? 'current' : ''}`.trim()}
                      onClick={() => pick(date)}
                    >{Number(date.slice(8, 10))}</button>
                  ))}
              </div>
            </>
          ) : null}

          {view === 'month' ? (
            <>
              <div className="picker-head">
                <button type="button" onClick={() => setMonth(shiftMonth(month, -12))} aria-label="Tahun sebelumnya"><ChevronLeft size={16} /></button>
                <button type="button" className="picker-head-label" onClick={() => setView('year')}>{year}</button>
                <button type="button" onClick={() => setMonth(shiftMonth(month, 12))} aria-label="Tahun berikutnya"><ChevronRight size={16} /></button>
              </div>
              <MonthGrid year={year} selected={month} onPick={(picked) => { setMonth(picked); setView('day') }} />
            </>
          ) : null}

          {view === 'year' ? (
            <>
              <div className="picker-head">
                <button type="button" onClick={() => setMonth(shiftMonth(month, -12 * YEARS_PER_PAGE))} aria-label="Dua belas tahun sebelumnya"><ChevronLeft size={16} /></button>
                <strong>{yearPageStart}–{yearPageStart + YEARS_PER_PAGE - 1}</strong>
                <button type="button" onClick={() => setMonth(shiftMonth(month, 12 * YEARS_PER_PAGE))} aria-label="Dua belas tahun berikutnya"><ChevronRight size={16} /></button>
              </div>
              <div className="picker-grid months">
                {Array.from({ length: YEARS_PER_PAGE }, (_, index) => yearPageStart + index).map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={option === year ? 'selected' : ''}
                    onClick={() => { setMonth(shiftMonth(month, (option - year) * 12)); setView('month') }}
                  >{option}</button>
                ))}
              </div>
            </>
          ) : null}

          <div className="picker-foot">
            <button type="button" disabled={outOfRange(today)} onClick={() => pick(today)}>Hari ini</button>
            {value ? <button type="button" onClick={() => pick('')}>Kosongkan</button> : null}
          </div>
        </div>
      ), document.body) : null}
    </div>
  )
}
