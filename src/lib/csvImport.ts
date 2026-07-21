import type { CensusCategory, Gender, Jamaah, StudyClass } from '../types/domain'

export type ImportRowStatus = 'valid' | 'invalid' | 'duplicate'

export interface JamaahImportPreview {
  rowNumber: number
  rawName: string
  jamaah: Jamaah | null
  status: ImportRowStatus
  messages: string[]
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ['nama', 'nama lengkap', 'namalengkap'],
  gender: ['jenis kelamin', 'jeniskelamin', 'gender'],
  birthDate: ['tanggal lahir', 'tanggallahir', 'tgl lahir', 'tgllahir'],
  phone: ['whatsapp', 'nomor whatsapp', 'nomorwa', 'no wa', 'nowa', 'nomor hp', 'nomorhp', 'hp'],
  censusCategory: ['kategori sensus', 'kategorisensus', 'kategori'],
  classes: ['kelas pengajian', 'kelaspengajian', 'kelas'],
  active: ['status', 'status data', 'statusdata'],
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-./]+/g, ' ')
}

function normalizeHeader(value: string): string {
  return normalizeText(value).replace(/\s+/g, '')
}

function findHeaderIndex(headers: string[], field: keyof typeof HEADER_ALIASES): number {
  const aliases = (HEADER_ALIASES[field] ?? []).map(normalizeHeader)
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)))
}

function detectDelimiter(text: string): ',' | ';' {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? ''
  let commas = 0
  let semicolons = 0
  let quoted = false
  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index]
    if (character === '"') {
      if (quoted && firstLine[index + 1] === '"') index += 1
      else quoted = !quoted
    } else if (!quoted && character === ',') commas += 1
    else if (!quoted && character === ';') semicolons += 1
  }
  return semicolons > commas ? ';' : ','
}

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(clean)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < clean.length; index += 1) {
    const character = clean[index]
    if (character === '"') {
      if (quoted && clean[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (!quoted && character === delimiter) {
      row.push(cell.trim())
      cell = ''
      continue
    }
    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && clean[index + 1] === '\n') index += 1
      row.push(cell.trim())
      cell = ''
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      continue
    }
    cell += character
  }

  row.push(cell.trim())
  if (row.some((value) => value.length > 0)) rows.push(row)
  return rows
}

function normalizeGender(value: string): Gender | null {
  const normalized = normalizeText(value)
  if (['laki laki', 'laki', 'pria', 'l', 'male'].includes(normalized)) return 'Laki-laki'
  if (['perempuan', 'wanita', 'p', 'female'].includes(normalized)) return 'Perempuan'
  return null
}

function normalizeDate(value: string): string | null {
  const trimmed = value.trim()
  let year: number
  let month: number
  let day: number

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const localMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (isoMatch) {
    year = Number(isoMatch[1])
    month = Number(isoMatch[2])
    day = Number(isoMatch[3])
  } else if (localMatch) {
    day = Number(localMatch[1])
    month = Number(localMatch[2])
    year = Number(localMatch[3])
  } else {
    return null
  }

  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function normalizeCategory(value: string, categories: CensusCategory[]): CensusCategory | null {
  const normalized = normalizeText(value)
  return categories.find((category) => normalizeText(category) === normalized) ?? null
}

function normalizeActive(value: string): boolean | null {
  const normalized = normalizeText(value)
  if (!normalized || ['aktif', 'active', 'ya', 'yes', 'true', '1'].includes(normalized)) return true
  if (['nonaktif', 'non aktif', 'tidak aktif', 'inactive', 'tidak', 'no', 'false', '0'].includes(normalized)) return false
  return null
}

function duplicateKey(name: string, birthDate: string, phone: string): string {
  const normalizedPhone = phone.replace(/\D/g, '')
  if (birthDate) return `${normalizeText(name)}|birth:${birthDate}`
  if (normalizedPhone) return `${normalizeText(name)}|phone:${normalizedPhone}`
  return `${normalizeText(name)}|without-birth-date`
}

export function buildJamaahImportPreview(
  text: string,
  existing: Jamaah[],
  classes: StudyClass[],
  categories: CensusCategory[],
): JamaahImportPreview[] {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('File CSV tidak memiliki baris data.')

  const headers = rows[0] ?? []
  const indices = {
    name: findHeaderIndex(headers, 'name'),
    gender: findHeaderIndex(headers, 'gender'),
    birthDate: findHeaderIndex(headers, 'birthDate'),
    phone: findHeaderIndex(headers, 'phone'),
    censusCategory: findHeaderIndex(headers, 'censusCategory'),
    classes: findHeaderIndex(headers, 'classes'),
    active: findHeaderIndex(headers, 'active'),
  }

  const missing = [
    indices.name < 0 ? 'Nama' : '',
    indices.gender < 0 ? 'Jenis Kelamin' : '',
    indices.censusCategory < 0 ? 'Kategori Sensus' : '',
  ].filter(Boolean)
  if (missing.length) throw new Error(`Kolom wajib belum ditemukan: ${missing.join(', ')}.`)

  const classMap = new Map(classes.filter((item) => item.active).map((item) => [normalizeText(item.name), item]))
  const existingKeys = new Set(existing.map((item) => duplicateKey(item.fullName, item.birthDate, item.phone)))
  const fileKeys = new Set<string>()

  return rows.slice(1).map((cells, rowIndex) => {
    const messages: string[] = []
    const name = cells[indices.name]?.trim() ?? ''
    const gender = normalizeGender(cells[indices.gender] ?? '')
    const rawBirthDate = indices.birthDate >= 0 ? (cells[indices.birthDate] ?? '').trim() : ''
    const normalizedBirthDate = rawBirthDate ? normalizeDate(rawBirthDate) : ''
    const birthDate = normalizedBirthDate ?? ''
    const censusCategory = normalizeCategory(cells[indices.censusCategory] ?? '', categories)
    const active = indices.active >= 0 ? normalizeActive(cells[indices.active] ?? '') : true
    const phone = indices.phone >= 0 ? (cells[indices.phone] ?? '').trim() : ''
    const classNames = indices.classes >= 0
      ? (cells[indices.classes] ?? '').split('|').map((item) => item.trim()).filter(Boolean)
      : []
    const classIds: string[] = []

    if (!name) messages.push('Nama kosong.')
    if (!gender) messages.push('Jenis kelamin tidak dikenali.')
    if (rawBirthDate && !normalizedBirthDate) messages.push('Tanggal lahir harus YYYY-MM-DD atau DD/MM/YYYY.')
    if (!censusCategory) messages.push('Kategori sensus tidak dikenali.')
    if (active === null) messages.push('Status harus Aktif atau Nonaktif.')

    classNames.forEach((className) => {
      const studyClass = classMap.get(normalizeText(className))
      if (!studyClass) messages.push(`Kelas “${className}” tidak ditemukan.`)
      else if (!classIds.includes(studyClass.id)) classIds.push(studyClass.id)
    })

    if (messages.length || !gender || !censusCategory || active === null) {
      return { rowNumber: rowIndex + 2, rawName: name, jamaah: null, status: 'invalid', messages }
    }

    const key = duplicateKey(name, birthDate, phone)
    if (existingKeys.has(key) || fileKeys.has(key)) {
      return {
        rowNumber: rowIndex + 2,
        rawName: name,
        jamaah: null,
        status: 'duplicate',
        messages: [birthDate ? 'Nama dan tanggal lahir sudah ada. Baris akan dilewati.' : 'Data dengan nama yang sama dan tanpa tanggal lahir sudah ada. Baris akan dilewati.'],
      }
    }
    fileKeys.add(key)

    return {
      rowNumber: rowIndex + 2,
      rawName: name,
      jamaah: {
        id: crypto.randomUUID(),
        fullName: name,
        gender,
        birthDate,
        phone,
        censusCategory,
        active,
        classIds,
      },
      status: 'valid',
      messages: [],
    }
  })
}
