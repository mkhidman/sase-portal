import { useEffect, useMemo, useState } from 'react'
import type { PageSize } from '../components/Pagination'

export function usePagination<T>(items: T[], resetKey: string, initialPageSize: PageSize = 10) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(initialPageSize)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  useEffect(() => {
    setPage(1)
  }, [resetKey, pageSize])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  )

  return { page, pageSize, setPage, setPageSize, pageItems }
}
