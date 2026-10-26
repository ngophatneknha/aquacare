import type { Alert, Device } from './api'

export const OFFLINE_AFTER_S = 300 // 5 phút không có số đo => mất tín hiệu
export const CALIBRATION_DAYS = 30
const DAY = 86400

export const isOpen = (a: Pick<Alert, 'status'>) => a.status === 'new' || a.status === 'investigating'
export const isOnline = (d: Pick<Device, 'last_ts'>, now: number) => d.last_ts != null && now - d.last_ts < OFFLINE_AFTER_S

export type Calibration = 'ok' | 'due' | 'never'
export function calibration(d: Pick<Device, 'calibrated_ts'>, now: number): Calibration {
  if (d.calibrated_ts == null) return 'never'
  return now - d.calibrated_ts > CALIBRATION_DAYS * DAY ? 'due' : 'ok'
}

export type Risk = { score: number; level: 'high' | 'medium' | 'low'; reasons: string[] }

/** Điểm ưu tiên kiểm tra của một cơ sở. now tính bằng giây. */
export function risk(d: Device, alerts: Alert[], now: number): Risk {
  const mine = alerts.filter(a => a.device === d.id)
  const open = mine.filter(isOpen).length
  const pollution24 = mine.filter(a => a.kind !== 'sensor' && a.status !== 'false_alarm' && now - a.ts < DAY).length
  const reasons: string[] = []
  let score = 0
  if (open) { score += open * 3; reasons.push(`${open} cảnh báo chưa xử lý`) }
  if (pollution24) { score += pollution24; reasons.push(`${pollution24} lần bất thường trong 24 giờ`) }
  if (!isOnline(d, now)) { score += 5; reasons.push('mất tín hiệu') }
  const cal = calibration(d, now)
  if (cal !== 'ok') { score += 2; reasons.push(cal === 'never' ? 'chưa hiệu chuẩn' : 'quá hạn hiệu chuẩn') }
  return { score, level: score >= 8 ? 'high' : score >= 3 ? 'medium' : 'low', reasons }
}

export type Kpis = { online: number; total: number; open: number; last24: number; falseRate: number | null; mttrMin: number | null }

/** Các chỉ số đánh giá thí điểm: thiết bị trực tuyến, cảnh báo, tỷ lệ cảnh báo sai, thời gian xử lý trung bình */
export function kpis(devices: Device[], alerts: Alert[], now: number): Kpis {
  const closed = alerts.filter(a => !isOpen(a) && a.closed_ts != null)
  return {
    online: devices.filter(d => isOnline(d, now)).length,
    total: devices.length,
    open: alerts.filter(isOpen).length,
    last24: alerts.filter(a => now - a.ts < DAY).length,
    falseRate: closed.length ? closed.filter(a => a.status === 'false_alarm').length / closed.length : null,
    mttrMin: closed.length ? closed.reduce((s, a) => s + (a.closed_ts! - a.ts), 0) / closed.length / 60 : null,
  }
}
