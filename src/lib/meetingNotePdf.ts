export interface MeetingNotePdfAction {
  task: string
  assigneeName: string
  dueDateLabel: string
  status: string
}

export interface MeetingNotePdfInput {
  title: string
  dateLabel: string
  statusLabel: string
  participantNames: string[]
  agenda: string
  discussionSummary: string
  decisions: string
  additionalNotes: string
  actions: MeetingNotePdfAction[]
}

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const MARGIN = 42
const CONTENT_BOTTOM = 44

function latinText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
}

function escapeText(value: unknown): string {
  return latinText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function textWidth(value: string, size: number): number {
  return latinText(value).length * size * 0.49
}

function wrap(value: unknown, width: number, size: number): string[] {
  const paragraphs = latinText(value).split('\n')
  const result: string[] = []
  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      result.push('')
      return
    }
    let current = ''
    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word
      if (current && textWidth(candidate, size) > width) {
        result.push(current)
        current = word
      } else {
        current = candidate
      }
    })
    if (current) result.push(current)
  })
  return result.length ? result : ['']
}

function fillColor(r: number, g: number, b: number): string { return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} rg` }
function strokeColor(r: number, g: number, b: number): string { return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} RG` }
function textCommand(value: unknown, x: number, y: number, size: number, bold: boolean): string {
  return `BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapeText(value)}) Tj ET`
}

class PdfDocument {
  private pages: string[][] = [[]]
  private pageIndex = 0
  private y = PAGE_HEIGHT - MARGIN

  get cursorY(): number { return this.y }
  set cursorY(value: number) { this.y = value }
  private current(): string[] { return this.pages[this.pageIndex] ?? this.pages[0]! }
  addPage(): void { this.pages.push([]); this.pageIndex += 1; this.y = PAGE_HEIGHT - MARGIN }
  ensureSpace(height: number): void { if (this.y - height < CONTENT_BOTTOM) this.addPage() }
  fillRect(x: number, y: number, width: number, height: number, rgb: [number, number, number]): void { this.current().push(fillColor(...rgb), `${x} ${y} ${width} ${height} re f`) }
  strokeRect(x: number, y: number, width: number, height: number, rgb: [number, number, number] = [220, 229, 222]): void { this.current().push(strokeColor(...rgb), '0.6 w', `${x} ${y} ${width} ${height} re S`) }
  text(value: unknown, x: number, y: number, size = 8, bold = false, rgb: [number, number, number] = [23, 32, 25]): void { this.current().push(fillColor(...rgb), textCommand(value, x, y, size, bold)) }
  paragraph(value: unknown, x: number, width: number, size = 8, lineHeight = 12): void {
    const lines = wrap(value, width, size)
    lines.forEach((line) => { this.ensureSpace(lineHeight); this.text(line, x, this.y, size); this.y -= lineHeight })
  }
  toBytes(): Uint8Array {
    const objects: string[] = []
    const add = (content: string): number => { objects.push(content); return objects.length }
    const catalogId = add('')
    const pagesId = add('')
    const regularFontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    const boldFontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    const pageIds: number[] = []
    this.pages.forEach((commands, index) => {
      commands.push(fillColor(102, 115, 106), textCommand(`Halaman ${index + 1} dari ${this.pages.length}`, PAGE_WIDTH - 105, 20, 6.5, false))
      const stream = commands.join('\n')
      const streamId = add(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`)
      const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${streamId} 0 R >>`)
      pageIds.push(pageId)
    })
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
    const encoder = new TextEncoder()
    const parts: Uint8Array[] = [encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')]
    const offsets = [0]
    let totalLength = parts[0]!.length
    objects.forEach((object, index) => { offsets.push(totalLength); const bytes = encoder.encode(`${index + 1} 0 obj\n${object}\nendobj\n`); parts.push(bytes); totalLength += bytes.length })
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

export function buildMeetingNotePdfBytes(input: MeetingNotePdfInput): Uint8Array {
  const pdf = new PdfDocument()
  const contentWidth = PAGE_WIDTH - MARGIN * 2
  pdf.fillRect(0, PAGE_HEIGHT - 92, PAGE_WIDTH, 92, [31, 111, 74])
  pdf.text('NOTULENSI MUSYAWARAH', MARGIN, PAGE_HEIGHT - 34, 10, true, [222, 241, 229])
  pdf.text(input.title, MARGIN, PAGE_HEIGHT - 60, 19, true, [255, 255, 255])
  pdf.text(`${input.dateLabel}  |  ${input.statusLabel}`, MARGIN, PAGE_HEIGHT - 79, 8, false, [226, 244, 232])
  pdf.cursorY = PAGE_HEIGHT - 125

  const section = (title: string, body: string) => {
    if (!body.trim()) return
    pdf.ensureSpace(42)
    pdf.text(title, MARGIN, pdf.cursorY, 10, true, [31, 111, 74])
    pdf.cursorY -= 15
    pdf.paragraph(body, MARGIN, contentWidth, 8.5, 12)
    pdf.cursorY -= 8
  }

  section('Peserta', input.participantNames.join('  •  '))
  section('Agenda / Pokok Pembahasan', input.agenda)
  section('Ringkasan Pembahasan', input.discussionSummary)
  section('Keputusan / Kesimpulan', input.decisions)
  section('Catatan Tambahan', input.additionalNotes)

  if (input.actions.length) {
    pdf.ensureSpace(70)
    pdf.text('Tindak Lanjut Keputusan', MARGIN, pdf.cursorY, 10, true, [31, 111, 74])
    pdf.cursorY -= 16
    input.actions.forEach((action, index) => {
      const lines = wrap(`${index + 1}. ${action.task}`, contentWidth - 10, 8.5)
      const height = Math.max(30, lines.length * 11 + 16)
      pdf.ensureSpace(height + 8)
      pdf.fillRect(MARGIN, pdf.cursorY - height + 4, contentWidth, height, index % 2 ? [248, 251, 249] : [255, 255, 255])
      pdf.strokeRect(MARGIN, pdf.cursorY - height + 4, contentWidth, height)
      lines.forEach((line, lineIndex) => pdf.text(line, MARGIN + 7, pdf.cursorY - 10 - lineIndex * 11, 8.5, lineIndex === 0))
      const meta = `Penanggung jawab: ${action.assigneeName || '-'}  |  Tenggat: ${action.dueDateLabel || '-'}  |  Status: ${action.status}`
      pdf.text(meta, MARGIN + 7, pdf.cursorY - height + 13, 7, false, [102, 115, 106])
      pdf.cursorY -= height + 7
    })
  }
  return pdf.toBytes()
}

export function downloadMeetingNotePdf(input: MeetingNotePdfInput, filename: string): void {
  const bytes = buildMeetingNotePdfBytes(input)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const blob = new Blob([buffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
