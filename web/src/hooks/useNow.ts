import { useEffect, useState } from 'react'

/** Thời điểm hiện tại, cập nhật mỗi `ms` để các nhãn "x giây trước" tự chạy */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
