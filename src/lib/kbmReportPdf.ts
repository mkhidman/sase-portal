import { approximateTextWidth, latinText, MARGIN, PAGE_HEIGHT, PAGE_WIDTH, PdfDocument } from './monthlyReportPdf.ts'
import type { KbmClassReport } from './kbmReport.ts'

export interface KbmReportPdfInput {
  month: string
  monthLabel: string
  reports: KbmClassReport[]
}

const INK: [number, number, number] = [23, 32, 25]
const MUTED: [number, number, number] = [101, 119, 140]
const RULE: [number, number, number] = [205, 214, 230]
const SESSION_BAR: [number, number, number] = [240, 192, 64]
const GOOD: [number, number, number] = [26, 111, 213]
const WARN: [number, number, number] = [201, 128, 13]
const LOW: [number, number, number] = [169, 43, 34]

const CHART_HEIGHT = 150
const BAR_WIDTH_MAX = 30
const BAR_WIDTH_MIN = 13
const BAR_GAP = 9
const HEADER_BG: [number, number, number] = [26, 111, 213]
const HEADER_HEIGHT = 26
const BLOCK_GAP = 16

function toneFor(percent: number): [number, number, number] {
  if (percent >= 80) return GOOD
  if (percent >= 60) return WARN
  return LOW
}

/** Nama di bawah batang dipotong, bukan dibungkus: dua baris membuat batang bergeser. */
function fitLabel(value: string, width: number, size: number): string {
  let text = latinText(value).split(' ')[0] ?? ''
  if (approximateTextWidth(text, size) <= width) return text
  while (text.length > 2 && approximateTextWidth(`${text}.`, size) > width) text = text.slice(0, -1)
  return `${text}.`
}

export function buildKbmReportPdfBytes(input: KbmReportPdfInput): Uint8Array {
  const pdf = new PdfDocument()
  const contentBottom = MARGIN + 14
  let y = PAGE_HEIGHT - MARGIN - 34

  const drawTitle = () => {
    const title = latinText('LAPORAN PENCAPAIAN KBM')
    const sub = latinText(input.monthLabel.toUpperCase())
    pdf.text(title, (PAGE_WIDTH - approximateTextWidth(title, 13)) / 2, PAGE_HEIGHT - MARGIN - 10, 13, true, INK)
    pdf.text(sub, (PAGE_WIDTH - approximateTextWidth(sub, 9)) / 2, PAGE_HEIGHT - MARGIN - 24, 9, true, MUTED)
  }

  drawTitle()

  const chartWidth = PAGE_WIDTH - MARGIN * 2 - 28

  for (const report of input.reports) {
    // Lebar batang menyesuaikan jumlah generus; kalau sudah mentok di batas
    // terkecil, kelasnya dipecah jadi beberapa blok. Pra Nikah berisi 30-an
    // generus dan tanpa ini batangnya menjorok keluar halaman tanpa peringatan.
    const perChunk = Math.max(1, Math.floor((chartWidth - BAR_WIDTH_MIN - BAR_GAP) / (BAR_WIDTH_MIN + BAR_GAP)))
    const chunks: typeof report.members[] = []
    for (let index = 0; index < report.members.length; index += perChunk) {
      chunks.push(report.members.slice(index, index + perChunk))
    }
    if (!chunks.length) chunks.push([])

    chunks.forEach((chunk, chunkIndex) => {
      const columns = chunk.length + 1
      const barWidth = Math.min(BAR_WIDTH_MAX, (chartWidth - (columns - 1) * BAR_GAP) / columns)
      const blockHeight = HEADER_HEIGHT + CHART_HEIGHT + 22

      if (y - blockHeight < contentBottom) {
        pdf.addPage()
        drawTitle()
        y = PAGE_HEIGHT - MARGIN - 34
      }

      pdf.fillRect(MARGIN, y - HEADER_HEIGHT, PAGE_WIDTH - MARGIN * 2, HEADER_HEIGHT, HEADER_BG)
      const heading = latinText(chunkIndex ? `${report.className} (lanjutan)` : report.className).toUpperCase()
      pdf.text(heading, MARGIN + 10, y - 17, 11, true, [255, 255, 255])
      const meta = latinText(`${report.sessions} TM   rata-rata kelas ${report.averagePercent}%`)
      pdf.text(meta, PAGE_WIDTH - MARGIN - 10 - approximateTextWidth(meta, 8.5), y - 17, 8.5, true, [255, 255, 255])

      const baseY = y - HEADER_HEIGHT - CHART_HEIGHT - 4
      pdf.strokeRect(MARGIN, baseY, PAGE_WIDTH - MARGIN * 2, CHART_HEIGHT + 4, RULE)

      // Batang pertama adalah jumlah pertemuan, sama seperti laporan cetak selama ini.
      let x = MARGIN + 14
      pdf.fillRect(x, baseY, barWidth, CHART_HEIGHT, SESSION_BAR)
      const tm = `${report.sessions} TM`
      pdf.text(tm, x + (barWidth - approximateTextWidth(tm, 7)) / 2, baseY + CHART_HEIGHT / 2, 7, true, INK)
      pdf.text('Pertemuan', x + (barWidth - approximateTextWidth('Pertemuan', 5.6)) / 2, baseY - 9, 5.6, false, MUTED)
      x += barWidth + BAR_GAP

      for (const row of chunk) {
        const height = row.recorded ? Math.max((row.percent / 100) * CHART_HEIGHT, 8) : 0
        if (height) {
          pdf.fillRect(x, baseY, barWidth, height, toneFor(row.percent))
          const label = `${row.percent}%`
          const inside = height >= 22
          pdf.text(label, x + (barWidth - approximateTextWidth(label, 6.6)) / 2, baseY + height - (inside ? 9 : -4), 6.6, true, inside ? [255, 255, 255] : INK)
        } else {
          pdf.text('-', x + barWidth / 2 - 2, baseY + 4, 6.6, false, MUTED)
        }
        const name = fitLabel(row.fullName, barWidth + BAR_GAP - 2, 5.6)
        pdf.text(name, x + (barWidth - approximateTextWidth(name, 5.6)) / 2, baseY - 9, 5.6, false, INK)
        x += barWidth + BAR_GAP
      }

      y = baseY - 18 - BLOCK_GAP
    })
  }

  return pdf.toBytes()
}

export function downloadKbmReportPdf(input: KbmReportPdfInput, filename: string): void {
  const bytes = buildKbmReportPdfBytes(input)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
