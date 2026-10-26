import { demoApi } from './demo'

export type MetricKey = 'ph' | 'temp' | 'tds' | 'turbidity' | 'flow'
export type Values = Partial<Record<MetricKey, number>>
export type Reading = Values & { ts: number }
export type Device = { id: string; name: string; owner: string; calibrated_ts: number | null; last_ts: number | null; last: Values | null; open_alerts: number }
export type AlertKind = 'sensor' | 'threshold' | 'spike'
export type AlertStatus = 'new' | 'investigating' | 'resolved' | 'false_alarm'
export type Alert = {
  id: number; ts: number; device: string; metric: string; value: number; reason: string
  kind: AlertKind; status: AlertStatus; note: string; closed_ts: number | null
}
export type Thresholds = Partial<Record<MetricKey, [number | null, number | null]>>
export type ChainStatus = { ok: boolean; checked: number; broken_at?: number }
export type AuditEntry = { seq: number; ts: number; kind: string; device: string | null; body: string; hash: string }

/** Sai hoặc thiếu khóa quản trị (HTTP 401) */
export class AuthError extends Error {}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path)
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return r.json()
}

async function post<T>(path: string, body: unknown, adminKey: string): Promise<T> {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (r.status === 401) throw new AuthError(data.error ?? 'Sai khóa quản trị')
  if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
  return data
}

const httpApi = {
  devices: () => get<Device[]>('/api/devices'),
  readings: (device: string, limit = 200) => get<Reading[]>(`/api/readings?device=${encodeURIComponent(device)}&limit=${limit}`),
  alerts: () => get<Alert[]>('/api/alerts'),
  thresholds: () => get<Thresholds>('/api/thresholds'),
  verify: () => get<ChainStatus>('/api/verify'),
  audit: () => get<AuditEntry[]>('/api/audit'),
  updateAlert: (id: number, status: AlertStatus, note: string, key: string) => post<{ ok: true }>('/api/alerts/update', { id, status, note }, key),
  calibrate: (id: string, note: string, key: string) => post<{ calibrated_ts: number }>('/api/devices/calibrate', { id, note }, key),
  setThresholds: (th: Thresholds, key: string) => post<{ ok: true }>('/api/thresholds', th, key),
  addDevice: (d: { id: string; name: string; owner: string }, key: string) => post<{ id: string; key: string }>('/api/devices', d, key),
}
export type Api = typeof httpApi

/** Build với VITE_DEMO=true (bản Netlify) thì dùng dữ liệu giả lập trong trình duyệt thay cho server */
export const DEMO = import.meta.env.VITE_DEMO === 'true'
export const api: Api = DEMO ? demoApi() : httpApi
