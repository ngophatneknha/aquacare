import { useEffect, useRef } from 'react'
import type { MetricKey, Thresholds } from '../lib/api'
import { rgb } from '../lib/color'
import { METRICS, isOut, pct, rangeLabel } from '../lib/metrics'
import { AnimatedNumber } from './AnimatedNumber'

type Props = { metric: MetricKey; history: (number | undefined)[]; thresholds: Thresholds; theme: string; delay: number }

export function Gauge({ metric, history, thresholds, theme, delay }: Props) {
  const m = METRICS[metric]
  const value = history.at(-1)
  const [lo, hi] = thresholds[metric] ?? [null, null]
  const bad = isOut(thresholds, metric, value)
  const [a, b] = m.span

  return (
    <div
      className={`panel relative grid gap-2 overflow-hidden px-4 pb-3.5 pt-4 transition duration-300 ease-out hover:-translate-y-[3px] animate-rise ${bad ? 'border-bad' : 'hover:border-accent/50'}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {bad && <span className="pointer-events-none absolute inset-0 rounded-[inherit] animate-alarm" />}
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">{m.label}</span>
        <span className={`pill ${bad ? 'pill-bad' : ''}`}>{value == null ? '—' : bad ? 'Vượt ngưỡng' : 'Trong ngưỡng'}</span>
      </div>
      <div className="num font-display text-[32px] font-bold leading-none tracking-tight">
        <AnimatedNumber value={value} decimals={m.decimals} />
        <small className="ml-1 font-body text-[13px] font-medium tracking-normal text-muted">{m.unit}</small>
      </div>
      <Sparkline values={history} bad={bad} theme={theme} />
      <div className="relative h-1.5 rounded-full border border-line bg-sunk" aria-hidden="true">
        <span className="absolute -inset-y-px rounded-full bg-ok/30" style={{ left: `${pct(metric, lo ?? a)}%`, right: `${100 - pct(metric, hi ?? b)}%` }} />
        <span
          className={`absolute top-1/2 -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border-[3px] bg-surface transition-[left,border-color] duration-700 ease-out ${bad ? 'border-bad' : 'border-accent'}`}
          style={{ left: `${value == null ? 0 : pct(metric, value)}%` }}
        />
      </div>
      <div className="num flex justify-between text-[11px] text-muted">
        <span>{a}</span>
        <span>{rangeLabel(lo, hi)}</span>
        <span>{b}</span>
      </div>
    </div>
  )
}

function Sparkline({ values, bad, theme }: { values: (number | undefined)[]; bad: boolean; theme: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current!
    const draw = () => {
      const d = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight
      if (!w) return
      cv.width = w * d
      cv.height = h * d
      const ctx = cv.getContext('2d')!
      ctx.setTransform(d, 0, 0, d, 0, 0)
      const v = values.slice(-60).filter((x): x is number => x != null)
      if (v.length < 2) return
      const min = Math.min(...v), max = Math.max(...v), r = max - min || 1
      const color = bad ? 'bad' : 'accent'
      const pts = v.map((y, i) => [(i / (v.length - 1)) * (w - 6) + 3, h - 5 - ((y - min) / r) * (h - 10)])
      const path = () => {
        ctx.beginPath()
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      }
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, rgb(color, 0.33))
      g.addColorStop(1, rgb(color, 0))
      path()
      ctx.lineTo(pts.at(-1)![0], h)
      ctx.lineTo(pts[0][0], h)
      ctx.fillStyle = g
      ctx.fill()
      path()
      ctx.strokeStyle = rgb(color)
      ctx.lineWidth = 1.8
      ctx.lineJoin = 'round'
      ctx.stroke()
      const [ex, ey] = pts.at(-1)!
      ctx.fillStyle = rgb(color)
      ctx.beginPath()
      ctx.arc(ex, ey, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [values, bad, theme])

  return <canvas ref={ref} aria-hidden="true" className="block h-[46px] w-full" />
}
