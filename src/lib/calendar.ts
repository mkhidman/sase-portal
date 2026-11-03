import { addMonths, format, getDay, getDaysInMonth, parseISO } from 'date-fns'

export const WEEKDAY_LABELS = ['SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB', 'MIN']

/**
 * Sel kalender satu bulan, Senin di kolom pertama. `null` adalah sel kosong
 * sebelum tanggal 1; sel kosong setelah tanggal terakhir tidak ikut dikembalikan
 * karena tidak perlu digambar.
 */
export function buildMonthGrid(month: string): (string | null)[] {
  const first = parseISO(`${month}-01`)
  // getDay() memakai Minggu = 0. Pergeseran +6 mod 7 memindahkannya ke Senin = 0.
  const lead = (getDay(first) + 6) % 7
  const total = getDaysInMonth(first)
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let day = 1; day <= total; day += 1) cells.push(`${month}-${String(day).padStart(2, '0')}`)
  return cells
}

export function shiftMonth(month: string, delta: number): string {
  return format(addMonths(parseISO(`${month}-01`), delta), 'yyyy-MM')
}

/** 'Senin' untuk penanda akhir pekan: Sabtu dan Minggu digambar lebih redup. */
export function isWeekend(date: string): boolean {
  const day = getDay(parseISO(date))
  return day === 0 || day === 6
}

/** '19:30'–'21:00' menjadi '19.30 - 21.00 WIB'; jadwal tanpa jam tidak menghasilkan apa pun. */
export function formatTimeRange(startTime: string, endTime: string): string {
  if (!startTime && !endTime) return ''
  const clock = (value: string) => value.replace(':', '.')
  if (startTime && endTime) return `${clock(startTime)} - ${clock(endTime)} WIB`
  return `${clock(startTime || endTime)} WIB${startTime ? '' : ' (selesai)'}`
}
