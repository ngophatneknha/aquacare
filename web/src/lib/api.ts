import { demoApi } from './demo'

export type MetricKey = 'ph' | 'temp' | 'tds' | 'turbidity' | 'flow'
export type Values = Partial<Record<MetricKey, number>>
export type Reading = Values & { ts: number }
export type Device = { id: string; name: string; owner: string; last_ts: number | null; last: Values | null; open_alerts: number }
export type Alert = { id: number; ts: number; device: string; metric: string; value: number; reason: string; ack: 0 | 1 }
export type Thresholds = Partial<Record<MetricKey, [number | null, number | null]>>
export type ChainStatus = { ok: boolean; checked: number; broken_at?: number }

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path)
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return r.json()
}

const httpApi = {
  devices: () => get<Device[]>('/api/devices'),
  readings: (device: string, limit = 200) => get<Reading[]>(`/api/readings?device=${encodeURIComponent(device)}&limit=${limit}`),
  alerts: () => get<Alert[]>('/api/alerts'),
  thresholds: () => get<Thresholds>('/api/thresholds'),
  verify: () => get<ChainStatus>('/api/verify'),
  /** true nếu xác nhận thành công, false nếu sai khóa quản trị */
  ack: async (id: number, adminKey: string) => {
    const r = await fetch('/api/alerts/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      body: JSON.stringify({ id }),
    })
    if (r.status === 401) return false
    if (!r.ok) throw new Error(`ack: HTTP ${r.status}`)
    return true
  },
}

/** Build với VITE_DEMO=true (bản Netlify) thì dùng dữ liệu giả lập trong trình duyệt thay cho server */
export const DEMO = import.meta.env.VITE_DEMO === 'true'
export const api: typeof httpApi = DEMO ? demoApi() : httpApi
