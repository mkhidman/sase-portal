import { approximateTextWidth, latinText, MARGIN, PAGE_HEIGHT, PAGE_WIDTH, PdfDocument } from './monthlyReportPdf.ts'
import type { Gender, Jamaah } from '../types/domain'

export interface CensusPdfPerson {
  fullName: string
  birthYear: string
}

export interface CensusPdfGroup {
  categoryName: string
  male: CensusPdfPerson[]
  female: CensusPdfPerson[]
}

const GENDER_HEADINGS: Record<Gender, string> = { 'Laki-laki': 'LAKI - LAKI', Perempuan: 'PEREMPUAN' }

/**
 * Warga per kategori sensus, dipisah jenis kelamin, urut nama.
 *
 * Hanya warga aktif yang ikut: daftar ini dicetak sebagai daftar anggota, dan
 * warga yang sudah diarsipkan tidak lagi anggota. Penyaringnya ada di sini,
 * bukan di halaman, karena kekeliruannya tidak memunculkan error apa pun --
 * hanya daftar cetak yang isinya lebih panjang atau lebih pendek dari kenyataan.
 */
export function buildCensusPdfGroups(jamaah: Jamaah[], categories: readonly string[]): CensusPdfGroup[] {
  const active = jamaah.filter((person) => person.active)
  const byName = (left: CensusPdfPerson, right: CensusPdfPerson) => left.fullName.localeCompare(right.fullName, 'id')
  const toPerson = (person: Jamaah): CensusPdfPerson => ({
    fullName: person.fullName,
    birthYear: person.birthDate ? person.birthDate.slice(0, 4) : '',
  })

  return categories
    .map((categoryName) => {
      const members = active.filter((person) => person.censusCategory === categoryName)
      return {
        categoryName,
        male: members.filter((person) => person.gender === 'Laki-laki').map(toPerson).sort(byName),
        female: members.filter((person) => person.gender === 'Perempuan').map(toPerson).sort(byName),
      }
    })
    .filter((group) => group.male.length + group.female.length > 0)
}

type Line =
  | { kind: 'gender'; label: string }
  | { kind: 'person'; index: number; person: CensusPdfPerson }

function linesFor(group: CensusPdfGroup): Line[] {
  const lines: Line[] = []
  for (const gender of ['Laki-laki', 'Perempuan'] as Gender[]) {
    const people = gender === 'Laki-laki' ? group.male : group.female
    if (!people.length) continue
    lines.push({ kind: 'gender', label: GENDER_HEADINGS[gender] })
    people.forEach((person, index) => lines.push({ kind: 'person', index: index + 1, person }))
  }
  return lines
}

const COLUMNS = 4
const COLUMN_GAP = 11
const COLUMN_WIDTH = (PAGE_WIDTH - MARGIN * 2 - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS
const ROW_HEIGHT = 11
const TITLE_BLOCK = 44
const BOX_GAP = 9
const FONT = 6.6
const NO_WIDTH = 17
const YEAR_WIDTH = 30

const INK: [number, number, number] = [23, 32, 25]
const RULE: [number, number, number] = [120, 132, 150]

export interface CensusPdfInput {
  title: string
  periodLabel: string
  groups: CensusPdfGroup[]
}

function buildCensusPdfBytes(input: CensusPdfInput): Uint8Array {
  const pdf = new PdfDocument()
  const contentTop = PAGE_HEIGHT - MARGIN - TITLE_BLOCK
  const contentBottom = MARGIN
  let column = 0
  let y = contentTop

  const drawTitle = () => {
    const first = latinText(input.title)
    const second = latinText(input.periodLabel)
    pdf.text(first, (PAGE_WIDTH - approximateTextWidth(first, 11)) / 2, PAGE_HEIGHT - MARGIN - 10, 11, true, INK)
    pdf.text(second, (PAGE_WIDTH - approximateTextWidth(second, 9)) / 2, PAGE_HEIGHT - MARGIN - 24, 9, true, INK)
  }

  const columnX = () => MARGIN + column * (COLUMN_WIDTH + COLUMN_GAP)

  /** Pindah kolom; kolom terakhir habis berarti halaman baru. */
  const nextColumn = () => {
    column += 1
    if (column >= COLUMNS) {
      pdf.addPage()
      drawTitle()
      column = 0
    }
    y = contentTop
  }

  drawTitle()

  for (const group of input.groups) {
    const lines = linesFor(group)
    let cursor = 0
    let continued = false
    let activeGender = ''

    while (cursor < lines.length) {
      const headerHeight = ROW_HEIGHT * 2
      // Satu judul tanpa baris isi di bawahnya hanya jadi sampah di kaki kolom.
      if (y - (headerHeight + ROW_HEIGHT * 3) < contentBottom) nextColumn()

      // Judul jenis kelamin diulang di sambungannya: tanpa itu kolom berikutnya
      // melanjutkan penomoran tanpa satu pun penanda warga siapa yang didaftar.
      const repeat: Line[] = continued && activeGender && lines[cursor]?.kind !== 'gender'
        ? [{ kind: 'gender', label: activeGender }]
        : []
      const available = Math.floor((y - contentBottom - headerHeight) / ROW_HEIGHT) - repeat.length
      const take = Math.min(available, lines.length - cursor)
      for (const line of lines.slice(cursor, cursor + take)) if (line.kind === 'gender') activeGender = line.label
      const slice = [...repeat, ...lines.slice(cursor, cursor + take)]
      const boxTop = y
      const boxHeight = headerHeight + slice.length * ROW_HEIGHT
      const x = columnX()

      pdf.strokeRect(x, boxTop - boxHeight, COLUMN_WIDTH, boxHeight, RULE)

      const heading = latinText(continued ? `${group.categoryName} (lanjutan)` : group.categoryName).toUpperCase()
      pdf.text(heading, x + (COLUMN_WIDTH - approximateTextWidth(heading, FONT + 0.6)) / 2, boxTop - 8, FONT + 0.6, true, INK)
      pdf.strokeRect(x, boxTop - ROW_HEIGHT, COLUMN_WIDTH, ROW_HEIGHT, RULE)

      const nameX = x + NO_WIDTH + 3
      const yearX = x + COLUMN_WIDTH - YEAR_WIDTH + 3
      pdf.text('No', x + 3, boxTop - ROW_HEIGHT - 8, FONT, true, INK)
      pdf.text('Nama', nameX, boxTop - ROW_HEIGHT - 8, FONT, true, INK)
      pdf.text('TTL', yearX, boxTop - ROW_HEIGHT - 8, FONT, true, INK)
      pdf.strokeRect(x, boxTop - headerHeight, COLUMN_WIDTH, ROW_HEIGHT, RULE)

      slice.forEach((line, index) => {
        const rowY = boxTop - headerHeight - index * ROW_HEIGHT - 8
        if (line.kind === 'gender') {
          pdf.text(line.label, nameX, rowY, FONT, true, INK)
          return
        }
        pdf.text(String(line.index), x + 3, rowY, FONT, false, INK)
        pdf.text(fitName(line.person.fullName), nameX, rowY, FONT, false, INK)
        if (line.person.birthYear) pdf.text(line.person.birthYear, yearX, rowY, FONT, false, INK)
      })

      y = boxTop - boxHeight - BOX_GAP
      cursor += take
      continued = true
      if (cursor < lines.length) nextColumn()
    }
  }

  return pdf.toBytes()
}

/** Nama dipotong, bukan dibungkus: satu warga harus tetap satu baris supaya penomorannya lurus. */
function fitName(value: string): string {
  const width = COLUMN_WIDTH - NO_WIDTH - YEAR_WIDTH - 8
  let text = latinText(value)
  if (approximateTextWidth(text, FONT) <= width) return text
  while (text.length > 3 && approximateTextWidth(`${text}.`, FONT) > width) text = text.slice(0, -1)
  return `${text}.`
}

export function downloadCensusPdf(input: CensusPdfInput, filename: string): void {
  const bytes = buildCensusPdfBytes(input)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
