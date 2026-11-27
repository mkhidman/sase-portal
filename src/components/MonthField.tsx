import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { createPortal } from 'react-dom'
import { usePickerPanel } from '../hooks/usePickerPanel'
import { monthLabel, monthValue } from '../lib/utils'

const SHORT_MONTH = new Intl.DateTimeFormat('id-ID', { month: 'short' })
export const MONTH_LABELS = Array.from({ length: 12 }, (_, index) => SHORT_MONTH.format(new Date(2000, index, 1)))

/** 'YYYY-MM' selalu lewat date-fns, bukan sambungan string: '2026-7' yang kurang
 *  nol lolos tanpa error lalu membuat tiap penyaring `date.startsWith(month)`
 *  di aplikasi ini sunyi-sunyi tidak cocok apa pun. */
export function monthOf(year: number, index: number): string {
  return format(new Date(year, index, 1), 'yyyy-MM')
}

export function MonthGrid({ year, selected, onPick }: { year: number; selected: string; onPick: (month: string) => void }) {
  const thisMonth = monthValue()
  return (
    <div className="picker-grid months">
      {MONTH_LABELS.map((label, index) => {
        const month = monthOf(year, index)
        return (
          <button
            type="button"
            key={month}
            className={`${month === selected ? 'selected' : ''} ${month === thisMonth ? 'current' : ''}`.trim()}
            onClick={() => onPick(month)}
          >{label}</button>
        )
      })}
    </div>
  )
}

/**
 * Pengganti <input type="month">. Panel milik browser tidak bisa ditata sama
 * sekali dari CSS -- hanya kotak isiannya -- jadi satu-satunya cara
 * menyeragamkan tampilannya dengan aplikasi adalah menggambar sendiri.
 */
export function MonthField({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [year, setYear] = useState(() => Number(value.slice(0, 4)) || new Date().getFullYear())
  const { open, setOpen, anchor, wrapper, panel } = usePickerPanel(236, 232)

  useEffect(() => {
    if (!open) return
    setYear(Number(value.slice(0, 4)) || new Date().getFullYear())
  }, [open, value])

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
        <span>{value ? monthLabel(value) : 'Pilih bulan'}</span>
        <ChevronDown size={14} className={open ? 'rotated' : ''} />
      </button>
      {open ? createPortal((
        <div className="picker-panel" ref={panel} style={anchor} role="dialog" aria-label="Pilih bulan">
          <div className="picker-head">
            <button type="button" onClick={() => setYear((current) => current - 1)} aria-label="Tahun sebelumnya"><ChevronLeft size={16} /></button>
            <strong>{year}</strong>
            <button type="button" onClick={() => setYear((current) => current + 1)} aria-label="Tahun berikutnya"><ChevronRight size={16} /></button>
          </div>
          <MonthGrid year={year} selected={value} onPick={(month) => { onChange(month); setOpen(false) }} />
        </div>
      ), document.body) : null}
    </div>
  )
}
