import { useEffect, useRef } from 'react'
import type { Device, Thresholds } from '../lib/api'
import { channels, prefersReducedMotion } from '../lib/color'
import { isOut, rangeLabel } from '../lib/metrics'
import { AnimatedNumber } from './AnimatedNumber'

type Props = { device: Device | undefined; ph: number | undefined; thresholds: Thresholds; theme: string }

export function PhTank({ device, ph, thresholds, theme }: Props) {
  const [lo, hi] = thresholds.ph ?? [null, null]
  const bad = isOut(thresholds, 'ph', ph)
  const status = ph == null ? 'Đang chờ dữ liệu' : !bad ? 'Đạt quy chuẩn' : lo != null && ph < lo ? 'Quá axit · vượt ngưỡng' : 'Quá kiềm · vượt ngưỡng'

  return (
    <div className="panel relative isolate min-h-[300px] overflow-hidden animate-rise">
      <WaveCanvas level={ph == null ? 0.5 : Math.max(0.08, Math.min(0.95, ph / 14))} bad={bad} theme={theme} />
      <div className="flex h-full flex-col gap-1.5 p-5">
        <span className="eyebrow">{device ? `${device.id} · ${device.name}` : 'Chưa có thiết bị'}</span>
        <h2 className="font-display text-[15px] font-bold">pH nước thải</h2>
        <div
          className={`num mt-2 font-display text-[clamp(64px,9vw,104px)] font-extrabold leading-[.95] tracking-[-.04em] transition-colors duration-500 ${bad ? 'text-bad' : ''}`}
          style={{ textShadow: '0 2px 18px rgb(var(--surface))' }}
        >
          <AnimatedNumber value={ph} decimals={2} />
        </div>
        <span className={`pill ${bad ? 'pill-bad' : ''}`}>{status}</span>
        <span className="text-xs text-muted">
          Giới hạn <span className="num">{rangeLabel(lo, hi)}</span> · QCVN 40:2011/BTNMT cột B
        </span>
        <div className="num mt-auto flex justify-between pt-6 text-[11.5px] font-semibold text-ink/75">
          <span>0 axit</span>
          <span>7 trung tính</span>
          <span>14 kiềm</span>
        </div>
      </div>
    </div>
  )
}

/** Ba lớp sóng + bọt khí. Mực nước theo pH, màu ngả dần sang đỏ khi vượt ngưỡng. */
function WaveCanvas({ level, bad, theme }: { level: number; bad: boolean; theme: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const target = useRef({ level, bad: bad ? 1 : 0 })
  target.current = { level, bad: bad ? 1 : 0 }

  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    const fit = () => {
      const r = cv.getBoundingClientRect()
      const d = devicePixelRatio || 1
      cv.width = r.width * d
      cv.height = r.height * d
      ctx.setTransform(d, 0, 0, d, 0, 0)
    }
    const ro = new ResizeObserver(fit)
    ro.observe(cv)
    fit()

    const c1 = channels('accent2'), c2 = channels('accent'), cb = channels('bad')
    const mix = (a: number[], k: number) => a.map((x, i) => Math.round(x + (cb[i] - x) * k)).join(',')
    const s = { level: target.current.level, bad: target.current.bad, t: 0 }
    let bubbles: { x: number; y: number; r: number; v: number; p: number }[] = []
    const reduce = prefersReducedMotion()
    let raf = 0

    const frame = () => {
      const w = cv.clientWidth, h = cv.clientHeight
      s.level += (target.current.level - s.level) * (reduce ? 1 : 0.04)
      s.bad += (target.current.bad - s.bad) * (reduce ? 1 : 0.05)
      s.t += 0.016
      ctx.clearRect(0, 0, w, h)
      const top = mix(c1, s.bad), deep = mix(c2, s.bad)
      const base = h * (1 - s.level * 0.82) - 4
      const layers: [number, number, number, number][] = [[0.18, 14, 1.1, 0], [0.28, 10, 1.6, 2], [0.42, 7, 2.3, 4]]
      layers.forEach(([a, amp, speed, phase], i) => {
        const g = ctx.createLinearGradient(0, base, 0, h)
        g.addColorStop(0, `rgba(${top},${a})`)
        g.addColorStop(1, `rgba(${deep},${a + 0.12})`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let x = 0; x <= w; x += 6) {
          const y = base + i * 6 + Math.sin(x / (90 + i * 30) + s.t * speed + phase) * amp + Math.sin(x / 37 + s.t * speed * 1.7) * amp * 0.25
          ctx.lineTo(x, y)
        }
        ctx.lineTo(w, h)
        ctx.closePath()
        ctx.fill()
      })
      if (!reduce) {
        if (bubbles.length < 26 && Math.random() < 0.3) bubbles.push({ x: Math.random() * w, y: h + 6, r: 1 + Math.random() * 3, v: 0.3 + Math.random() * 0.8, p: Math.random() * 6 })
        ctx.fillStyle = `rgba(${top},.55)`
        bubbles = bubbles.filter(b => {
          b.y -= b.v
          b.x += Math.sin(s.t * 2 + b.p) * 0.3
          if (b.y < base + 8) return false
          ctx.beginPath()
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
          ctx.fill()
          return true
        })
        raf = requestAnimationFrame(frame)
      }
    }
    frame()
    // giảm chuyển động: vẽ lại tĩnh mỗi giây để mực nước vẫn theo số đo
    const slow = reduce ? setInterval(frame, 1000) : undefined
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(slow)
      ro.disconnect()
    }
  }, [theme])

  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full" />
}
