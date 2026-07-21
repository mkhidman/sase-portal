import { ChevronLeft, ChevronRight } from 'lucide-react'

export type PageSize = 10 | 15

export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: PageSize
  totalItems: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: PageSize) => void
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const first = totalItems ? ((safePage - 1) * pageSize) + 1 : 0
  const last = Math.min(safePage * pageSize, totalItems)

  return (
    <div className="pagination-bar">
      <span className="pagination-summary">Menampilkan {first}-{last} dari {totalItems} data</span>
      <div className="pagination-controls">
        <label>
          Baris
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value) as PageSize)}>
            <option value={10}>10</option>
            <option value={15}>15</option>
          </select>
        </label>
        <button className="icon-button" type="button" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} aria-label="Halaman sebelumnya"><ChevronLeft size={16} /></button>
        <span className="pagination-page">{safePage} / {totalPages}</span>
        <button className="icon-button" type="button" disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)} aria-label="Halaman berikutnya"><ChevronRight size={16} /></button>
      </div>
    </div>
  )
}
