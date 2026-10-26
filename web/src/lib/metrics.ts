import type { MetricKey, Thresholds } from './api'

export const METRICS: Record<MetricKey, { label: string; unit: string; short: string; decimals: number; span: [number, number] }> = {
  ph: { label: 'pH', unit: '', short: 'pH', decimals: 2, span: [0, 14] },
  temp: { label: 'Nhiệt độ', unit: '°C', short: '°C', decimals: 1, span: [0, 60] },
  tds: { label: 'TDS', unit: 'ppm', short: 'TDS', decimals: 0, span: [0, 3000] },
  turbidity: { label: 'Độ đục', unit: 'NTU', short: 'NTU', decimals: 1, span: [0, 200] },
  flow: { label: 'Lưu lượng', unit: 'L/phút', short: 'L/p', decimals: 1, span: [0, 200] },
}
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[]
export const isMetric = (m: string): m is MetricKey => m in METRICS

export function isOut(th: Thresholds, m: MetricKey, v: number | null | undefined): boolean {
  if (v == null) return false
  const [lo, hi] = th[m] ?? [null, null]
  return (lo != null && v < lo) || (hi != null && v > hi)
}

export function fmt(m: string, v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toFixed(isMetric(m) ? METRICS[m].decimals : 2)
}

/** Nhãn ngắn của vùng cho phép: "5.5 – 9", "≤ 40", "không giới hạn" */
export function rangeLabel(lo: number | null | undefined, hi: number | null | undefined): string {
  if (lo != null && hi != null) return `${lo} – ${hi}`
  if (hi != null) return `≤ ${hi}`
  if (lo != null) return `≥ ${lo}`
  return 'không giới hạn'
}

/** Vị trí phần trăm của v trên thang của chỉ số, kẹp trong 0–100 */
export function pct(m: MetricKey, v: number): number {
  const [a, b] = METRICS[m].span
  return Math.max(0, Math.min(100, ((v - a) / (b - a)) * 100))
}

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round(now / 1000 - ts))
  if (s < 60) return `${s} giây trước`
  if (s < 3600) return `${Math.round(s / 60)} phút trước`
  return new Date(ts * 1000).toLocaleString('vi-VN')
}
