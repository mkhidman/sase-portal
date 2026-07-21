export interface MonthlyClassPdfRow {
  className: string
  sessions: number
  members: number
  present: number
  excused: number
  sick: number
  absent: number
  attendanceRate: number
  hasda: string
  asad: string
  openFollowUps: number
}

export interface MonthlyJamaahPdfRow {
  className: string
  fullName: string
  censusCategory: string
  sessions: number
  present: number
  excused: number
  sick: number
  absent: number
  attendanceRate: number
  hasda: string
  asad: string
  followUp: string
}

export interface MonthlyCensusPdfRow {
  categoryName: string
  male: number
  female: number
  total: number
}

export interface MonthlyReportPdfInput {
  month: string
  monthLabel: string
  classLabel: string
  periodStatus: string
  periodNotes: string
  totals: {
    sessions: number
    attendanceRate: number
    present: number
    records: number
    jamaah: number
    openFollowUps: number
  }
  readiness: Array<{ label: string; ready: boolean }>
  census: MonthlyCensusPdfRow[]
  classes: MonthlyClassPdfRow[]
  jamaah: MonthlyJamaahPdfRow[]
}

type PdfPage = string[]

const PAGE_WIDTH = 842
const PAGE_HEIGHT = 595
const MARGIN = 34
const CONTENT_BOTTOM = 34

function latinText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
}

function escapePdfText(value: unknown): string {
  return latinText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function approximateTextWidth(text: string, fontSize: number): number {
  return latinText(text).length * fontSize * 0.49
}

function wrapText(value: unknown, width: number, fontSize: number, maxLines = 3): string[] {
  const words = latinText(value).split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (approximateTextWidth(candidate, fontSize) <= width || !current) {
      current = candidate
      continue
    }
    lines.push(current)
    current = word
    if (lines.length >= maxLines - 1) break
  }
  if (current && lines.length < maxLines) lines.push(current)
  const consumed = lines.join(' ').length
  const original = words.join(' ')
  if (consumed < original.length && lines.length) {
    const last = lines.length - 1
    let shortened = lines[last] ?? ''
    while (shortened.length > 2 && approximateTextWidth(`${shortened}...`, fontSize) > width) shortened = shortened.slice(0, -1)
    lines[last] = `${shortened}...`
  }
  return lines
}

function colorFill(r: number, g: number, b: number): string {
  return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} rg`
}

function colorStroke(r: number, g: number, b: number): string {
  return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} RG`
}

function textCommand(text: unknown, x: number, y: number, size = 8, bold = false): string {
  return `BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`
}

class PdfDocument {
  private pages: PdfPage[] = [[]]
  private pageIndex = 0
  private y = PAGE_HEIGHT - MARGIN

  current(): PdfPage { return this.pages[this.pageIndex] ?? this.pages[0]! }
  get cursorY(): number { return this.y }
  set cursorY(value: number) { this.y = value }

  addPage(): void {
    this.pages.push([])
    this.pageIndex += 1
    this.y = PAGE_HEIGHT - MARGIN
  }

  ensureSpace(height: number, onNewPage?: () => void): void {
    if (this.y - height >= CONTENT_BOTTOM) return
    this.addPage()
    onNewPage?.()
  }

  fillRect(x: number, y: number, width: number, height: number, rgb: [number, number, number]): void {
    this.current().push(colorFill(...rgb), `${x} ${y} ${width} ${height} re f`)
  }

  strokeRect(x: number, y: number, width: number, height: number, rgb: [number, number, number] = [220, 229, 222]): void {
    this.current().push(colorStroke(...rgb), '0.6 w', `${x} ${y} ${width} ${height} re S`)
  }

  text(value: unknown, x: number, y: number, size = 8, bold = false, rgb: [number, number, number] = [23, 32, 25]): void {
    this.current().push(colorFill(...rgb), textCommand(value, x, y, size, bold))
  }

  wrappedText(value: unknown, x: number, y: number, width: number, size = 8, bold = false, maxLines = 3, lineHeight = size * 1.25): number {
    const lines = wrapText(value, width, size, maxLines)
    lines.forEach((line, index) => this.text(line, x, y - (index * lineHeight), size, bold))
    return lines.length * lineHeight
  }

  table(headers: string[], rows: Array<Array<string | number>>, widths: number[], options: { fontSize?: number; title?: string } = {}): void {
    const fontSize = options.fontSize ?? 6.5
    const lineHeight = fontSize * 1.25
    const headerHeight = 20
    const drawHeader = () => {
      if (options.title) {
        this.text(options.title, MARGIN, this.y, 10, true)
        this.y -= 14
      }
      this.fillRect(MARGIN, this.y - headerHeight, widths.reduce((a, b) => a + b, 0), headerHeight, [31, 111, 74])
      let x = MARGIN
      headers.forEach((header, index) => {
        const lines = wrapText(header, (widths[index] ?? 0) - 8, 6.2, 2)
        lines.forEach((line, lineIndex) => this.text(line, x + 4, this.y - 8 - lineIndex * 7, 6.2, true, [255, 255, 255]))
        x += widths[index] ?? 0
      })
      this.y -= headerHeight
    }

    this.ensureSpace(headerHeight + 24, drawHeader)
    drawHeader()

    rows.forEach((row, rowIndex) => {
      const cells = row.map((cell, index) => wrapText(cell, (widths[index] ?? 0) - 8, fontSize, 3))
      const lines = Math.max(...cells.map((cell) => cell.length), 1)
      const rowHeight = Math.max(18, lines * lineHeight + 7)
      this.ensureSpace(rowHeight + headerHeight, drawHeader)
      if (rowIndex % 2 === 1) this.fillRect(MARGIN, this.y - rowHeight, widths.reduce((a, b) => a + b, 0), rowHeight, [248, 251, 249])
      this.strokeRect(MARGIN, this.y - rowHeight, widths.reduce((a, b) => a + b, 0), rowHeight)
      let x = MARGIN
      cells.forEach((linesForCell, cellIndex) => {
        linesForCell.forEach((line, lineIndex) => this.text(line, x + 4, this.y - 9 - lineIndex * lineHeight, fontSize, cellIndex === 0))
        x += widths[cellIndex] ?? 0
        if (cellIndex < cells.length - 1) this.current().push(colorStroke(220, 229, 222), '0.4 w', `${x} ${this.y} m ${x} ${this.y - rowHeight} l S`)
      })
      this.y -= rowHeight
    })
    this.y -= 10
  }

  toBytes(): Uint8Array {
    const objects: string[] = []
    const addObject = (content: string): number => { objects.push(content); return objects.length }
    const catalogId = addObject('')
    const pagesId = addObject('')
    const regularFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    const boldFontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    const pageIds: number[] = []

    this.pages.forEach((commands, index) => {
      commands.push(colorFill(102, 115, 106), textCommand(`Halaman ${index + 1} dari ${this.pages.length}`, PAGE_WIDTH - 100, 16, 6.5, false))
      const stream = commands.join('\n')
      const streamId = addObject(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`)
      const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${streamId} 0 R >>`)
      pageIds.push(pageId)
    })

    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

    const encoder = new TextEncoder()
    const parts: Uint8Array[] = [encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')]
    const offsets = [0]
    let totalLength = parts[0]!.length
    objects.forEach((object, index) => {
      offsets.push(totalLength)
      const bytes = encoder.encode(`${index + 1} 0 obj\n${object}\nendobj\n`)
      parts.push(bytes)
      totalLength += bytes.length
    })
    const xrefOffset = totalLength
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    offsets.slice(1).forEach((offset) => { xref += `${String(offset).padStart(10, '0')} 00000 n \n` })
    xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
    parts.push(encoder.encode(xref))
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
    let cursor = 0
    parts.forEach((part) => { result.set(part, cursor); cursor += part.length })
    return result
  }
}

export function buildMonthlyReportPdfBytes(input: MonthlyReportPdfInput): Uint8Array {
  const pdf = new PdfDocument()
  const drawPageHeader = () => {
    pdf.fillRect(0, PAGE_HEIGHT - 58, PAGE_WIDTH, 58, [31, 111, 74])
    pdf.text('Laporan Bulanan Sensus & Pengajian Jamaah', MARGIN, PAGE_HEIGHT - 26, 16, true, [255, 255, 255])
    pdf.text(`${input.monthLabel} | ${input.classLabel} | Periode ${input.periodStatus}`, MARGIN, PAGE_HEIGHT - 43, 8, false, [255, 255, 255])
    pdf.cursorY = PAGE_HEIGHT - 76
  }
  drawPageHeader()

  pdf.text('Ringkasan', MARGIN, pdf.cursorY, 10, true)
  pdf.cursorY -= 13
  const cardWidth = (PAGE_WIDTH - MARGIN * 2 - 18) / 4
  const cards: Array<[string, string]> = [
    ['Total Sesi', String(input.totals.sessions)],
    ['Kehadiran', `${input.totals.attendanceRate}%`],
    ['Jamaah Tercatat', String(input.totals.jamaah)],
    ['Tindak Lanjut', String(input.totals.openFollowUps)],
  ]
  cards.forEach(([label, value], index) => {
    const x = MARGIN + index * (cardWidth + 6)
    pdf.fillRect(x, pdf.cursorY - 34, cardWidth, 34, [248, 251, 249])
    pdf.strokeRect(x, pdf.cursorY - 34, cardWidth, 34)
    pdf.text(label, x + 7, pdf.cursorY - 12, 7, false, [102, 115, 106])
    pdf.text(value, x + 7, pdf.cursorY - 27, 13, true)
  })
  pdf.cursorY -= 45
  pdf.text(`${input.totals.present} hadir dari ${input.totals.records} catatan kehadiran.`, MARGIN, pdf.cursorY, 7.5, false, [70, 82, 74])
  pdf.cursorY -= 12
  const readiness = input.readiness.map((item) => `${item.ready ? '[OK]' : '[!]'} ${item.label}`).join('   ')
  pdf.cursorY -= pdf.wrappedText(readiness, MARGIN, pdf.cursorY, PAGE_WIDTH - MARGIN * 2, 7, false, 3, 9)
  pdf.cursorY -= 4

  pdf.table(
    ['Kategori Sensus', 'Laki-laki', 'Perempuan', 'Total'],
    input.census.map((row) => [row.categoryName, row.male, row.female, row.total]),
    [360, 138, 138, 138],
    { title: 'Komposisi Sensus Per Jenis Kelamin', fontSize: 7 },
  )

  pdf.table(
    ['Kelas', 'Sesi', 'Anggota', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Kehadiran', 'Hasda', 'ASAD', 'Tindak Lanjut'],
    input.classes.map((row) => [row.className, row.sessions, row.members, row.present, row.excused, row.sick, row.absent, `${row.attendanceRate}%`, row.hasda, row.asad, row.openFollowUps]),
    [130, 42, 48, 42, 38, 42, 42, 60, 46, 46, 62],
    { title: 'Ringkasan Per Kelas', fontSize: 6.5 },
  )

  pdf.table(
    ['Kelas', 'Nama Jamaah', 'Kategori', 'Sesi', 'H', 'I', 'S', 'A', 'Kehadiran', 'Hasda', 'ASAD', 'Tindak Lanjut'],
    input.jamaah.map((row) => [row.className, row.fullName, row.censusCategory, row.sessions, row.present, row.excused, row.sick, row.absent, `${row.attendanceRate}%`, row.hasda, row.asad, row.followUp]),
    [100, 120, 75, 34, 26, 26, 26, 26, 56, 42, 42, 77],
    { title: 'Detail Kehadiran Jamaah', fontSize: 6 },
  )

  if (input.periodNotes) {
    pdf.ensureSpace(38)
    pdf.text('Catatan periode', MARGIN, pdf.cursorY, 9, true)
    pdf.cursorY -= 12
    pdf.wrappedText(input.periodNotes, MARGIN, pdf.cursorY, PAGE_WIDTH - MARGIN * 2, 7.5, false, 5, 10)
  }

  return pdf.toBytes()
}

export function downloadMonthlyReportPdf(input: MonthlyReportPdfInput): void {
  const bytes = buildMonthlyReportPdfBytes(input)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const blob = new Blob([buffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `laporan-bulanan-${input.month}.pdf`
  anchor.click()
  URL.revokeObjectURL(url)
}
