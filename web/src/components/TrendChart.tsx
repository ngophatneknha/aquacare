import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  CategoryScale, Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, Tooltip,
  type ChartOptions, type ChartType, type Plugin, type ScriptableContext,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { MetricKey, Reading, Thresholds } from '../lib/api'
import { rgb, prefersReducedMotion } from '../lib/color'
import { METRICS, METRIC_KEYS, fmt, isOut } from '../lib/metrics'

type ThresholdOpts = { lo: number | null; hi: number | null; color: string; font: string }
declare module 'chart.js' {
  // tham số kiểu phải trùng khai báo gốc của chart.js dù không dùng tới
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PluginOptionsByType<TType extends ChartType> {
    thresholds?: ThresholdOpts
  }
}

// Vẽ đường nét đứt cho ngưỡng trên/dưới (QCVN) trên biểu đồ
const thresholdLines: Plugin<'line', ThresholdOpts> = {
  id: 'thresholds',
  afterDatasetsDraw(chart, _args, o) {
    const { ctx, chartArea: a, scales: { y } } = chart
    ctx.save()
    ctx.setLineDash([6, 5])
    ctx.lineWidth = 1.2
    ctx.font = o.font
    ctx.fillStyle = ctx.strokeStyle = o.color
    ctx.textAlign = 'right'
    for (const [v, txt] of [[o.lo, 'ngưỡng dưới'], [o.hi, 'ngưỡng trên']] as const) {
      if (v == null || v < y.min || v > y.max) continue
      const py = y.getPixelForValue(v)
      ctx.beginPath()
      ctx.moveTo(a.left, py)
      ctx.lineTo(a.right, py)
      ctx.stroke()
      ctx.fillText(`${txt} ${v}`, a.right - 4, py - 5)
    }
    ctx.restore()
  },
}
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, thresholdLines)

type Props = { readings: Reading[]; thresholds: Thresholds; theme: string }

export function TrendChart({ readings, thresholds, theme }: Props) {
  const [metric, setMetric] = useState<MetricKey>('ph')
  const m = METRICS[metric]
  const [lo, hi] = thresholds[metric] ?? [null, null]

  const data = useMemo(() => {
    const color = rgb('accent'), bad = rgb('bad')
    const out = (v: unknown) => typeof v === 'number' && isOut(thresholds, metric, v)
    return {
      labels: readings.map(r => new Date(r.ts * 1000).toLocaleTimeString('vi-VN')),
      datasets: [{
        label: m.label,
        data: readings.map(r => r[metric] ?? null),
        borderColor: color,
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        backgroundColor: (c: ScriptableContext<'line'>) => {
          const a = c.chart.chartArea
          if (!a) return rgb('accent', 0.15)
          const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom)
          g.addColorStop(0, rgb('accent', 0.28))
          g.addColorStop(1, rgb('accent', 0))
          return g
        },
        pointRadius: (c: ScriptableContext<'line'>) => (out(c.raw) ? 4 : 0),
        pointHoverRadius: 5,
        pointBorderWidth: 0,
        pointBackgroundColor: (c: ScriptableContext<'line'>) => (out(c.raw) ? bad : color),
        segment: { borderColor: (c: { p1: { parsed: { y: number } } }) => (out(c.p1.parsed.y) ? bad : undefined) },
      }],
    }
    // theme: màu đọc từ CSS nên phải tính lại khi đổi sáng/tối
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readings, metric, thresholds, theme])

  const options = useMemo<ChartOptions<'line'>>(() => {
    const muted = rgb('muted'), line = rgb('line')
    return {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: prefersReducedMotion() ? false : { duration: 900, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${m.label}: ${fmt(metric, c.raw as number)} ${m.unit}` } },
        thresholds: { lo, hi, color: rgb('bad'), font: '600 11px "Be Vietnam Pro", system-ui, sans-serif' },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 6, color: muted, font: { family: 'JetBrains Mono' } }, grid: { display: false } },
        y: { ticks: { color: muted, font: { family: 'JetBrains Mono' } }, grid: { color: line }, border: { display: false } },
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, lo, hi, theme])

  return (
    <section className="panel animate-rise" style={{ animationDelay: '.22s' }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <h3 className="font-display text-base font-bold">Diễn biến {readings.length} mẫu gần nhất</h3>
        <MetricTabs value={metric} onChange={setMetric} />
      </div>
      <div className="relative h-[320px] px-3 pb-3.5 pt-2">
        {readings.length ? (
          <Line data={data} options={options} aria-label={`Biểu đồ ${m.label} theo thời gian`} role="img" />
        ) : (
          <p className="grid h-full place-items-center text-muted">Chưa có số đo cho thiết bị này.</p>
        )}
      </div>
    </section>
  )
}

function MetricTabs({ value, onChange }: { value: MetricKey; onChange: (m: MetricKey) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 })

  // nền trắng trượt theo tab đang chọn
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!el) return
    const measure = () => setBox({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap.current!)
    document.fonts?.ready.then(measure)
    return () => ro.disconnect()
  }, [value])

  return (
    <div ref={wrap} role="tablist" aria-label="Chọn chỉ số" className="relative inline-flex flex-wrap rounded-[10px] border border-line bg-sunk p-[3px]">
      <span className="absolute rounded-lg bg-surface shadow-card transition-all duration-300 ease-out" style={box} aria-hidden="true" />
      {METRIC_KEYS.map(k => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={k === value}
          onClick={() => onChange(k)}
          className={`relative z-[1] rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${k === value ? 'text-ink' : 'text-muted hover:text-ink'}`}
        >
          {METRICS[k].label}
        </button>
      ))}
    </div>
  )
}
