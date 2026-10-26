import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/color'

/** Số chạy mượt từ giá trị cũ tới giá trị mới */
export function AnimatedNumber({ value, decimals }: { value: number | null | undefined; decimals: number }) {
  const [shown, setShown] = useState(value)
  const target = useRef(value)

  useEffect(() => {
    const from = target.current
    target.current = value
    if (value == null || from == null || from === value || prefersReducedMotion()) {
      setShown(value)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700)
      setShown(from + (value - from) * (1 - (1 - k) ** 3))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])

  return <>{shown == null ? '—' : shown.toFixed(decimals)}</>
}
