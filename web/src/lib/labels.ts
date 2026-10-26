import type { AlertKind, AlertStatus, AuditEntry, MetricKey, Thresholds } from './api'
import { METRICS, METRIC_KEYS, isMetric, rangeLabel } from './metrics'

export const STATUS_LABEL: Record<AlertStatus, string> = { new: 'Mới', investigating: 'Đang kiểm tra', resolved: 'Đã xử lý', false_alarm: 'Cảnh báo sai' }
export const KIND_LABEL: Record<AlertKind, string> = { threshold: 'Vượt ngưỡng', spike: 'Biến động', sensor: 'Lỗi cảm biến' }

export const ACTION_LABEL: Record<string, string> = {
  device_add: 'Thêm thiết bị',
  calibration: 'Hiệu chuẩn',
  threshold_change: 'Đổi ngưỡng',
  alert_update: 'Xử lý cảnh báo',
  alert_ack: 'Xác nhận cảnh báo',
}

/** Diễn giải nội dung một bản ghi nhật ký cho người đọc */
export function describeAudit(e: Pick<AuditEntry, 'kind' | 'body'>): string {
  let b: Record<string, unknown>
  try { b = JSON.parse(e.body) } catch { return e.body }
  switch (e.kind) {
    case 'device_add': return [b.name, b.owner].filter(Boolean).join(' · ') || '—'
    case 'calibration': return String(b.note || 'không ghi chú')
    case 'threshold_change':
      return Object.entries(b).map(([m, v]) => `${isMetric(m) ? METRICS[m].label : m} ${rangeLabel(...(v as [number | null, number | null]))}`).join('; ')
    case 'alert_update': {
      const s = STATUS_LABEL[b.status as AlertStatus] ?? b.status
      return `#${b.id} → ${s}${b.note ? `: ${b.note}` : ''}`
    }
    case 'alert_ack': return `#${b.id}`
    default: return e.body
  }
}

export type ThresholdDraft = Record<MetricKey, [string, string]>

export const toDraft = (th: Thresholds) =>
  Object.fromEntries(METRIC_KEYS.map(m => [m, (th[m] ?? [null, null]).map(v => (v == null ? '' : String(v)))])) as ThresholdDraft

/** Kiểm tra ô nhập ngưỡng (nhận cả dấu phẩy thập phân); trả về [ngưỡng, null] hoặc [null, lỗi] */
export function parseDraft(d: ThresholdDraft): [Thresholds, null] | [null, string] {
  const out: Thresholds = {}
  for (const m of METRIC_KEYS) {
    const [lo, hi] = d[m].map(s => (s.trim() === '' ? null : Number(s.trim().replace(',', '.'))))
    if ((lo != null && !Number.isFinite(lo)) || (hi != null && !Number.isFinite(hi))) return [null, `${METRICS[m].label}: ngưỡng phải là số`]
    if (lo != null && hi != null && lo > hi) return [null, `${METRICS[m].label}: ngưỡng dưới lớn hơn ngưỡng trên`]
    out[m] = [lo, hi]
  }
  return [out, null]
}
