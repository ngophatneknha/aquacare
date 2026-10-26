import { useCallback, useEffect, useState } from 'react'

export const PAGES = [
  { id: 'tong-quan', label: 'Tổng quan' },
  { id: 'giam-sat', label: 'Giám sát' },
  { id: 'canh-bao', label: 'Cảnh báo' },
  { id: 'thiet-bi', label: 'Thiết bị & ngưỡng' },
  { id: 'nhat-ky', label: 'Nhật ký' },
] as const
export type PageId = (typeof PAGES)[number]['id']

const read = (): PageId => {
  const h = location.hash.slice(1)
  return PAGES.some(p => p.id === h) ? (h as PageId) : 'tong-quan'
}

/** Trang hiện tại lưu trên #hash để bấm Back và gửi link từng trang được */
export function usePage() {
  const [page, setPage] = useState<PageId>(read)
  useEffect(() => {
    const on = () => setPage(read())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const go = useCallback((p: PageId) => {
    if (location.hash !== `#${p}`) location.hash = p
    scrollTo({ top: 0, behavior: 'smooth' })
  }, [])
  return { page, go }
}
