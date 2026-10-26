// Bản demo chạy hoàn toàn trong trình duyệt (dùng khi deploy tĩnh lên Netlify, không có server Python).
// Logic phát hiện bất thường, quy trình cảnh báo và chuỗi băm bám theo server/app.py.
import type { Alert, AlertKind, AlertStatus, AuditEntry, ChainStatus, Device, MetricKey, Reading, Thresholds, Values } from './api'
import { METRIC_KEYS } from './metrics'

export const DEMO_THRESHOLDS: Thresholds = { ph: [5.5, 9], temp: [null, 40], tds: [null, 2000], turbidity: [null, 100], flow: [null, null] }
const PHYSICAL: Record<MetricKey, [number, number | null]> = { ph: [0, 14], temp: [-5, 100], tds: [0, 20000], turbidity: [0, 4000], flow: [0, null] }
const SPIKE_WINDOW = 20
const SPIKE_Z = 4

type Found = { metric: MetricKey; value: number; reason: string; kind: AlertKind }

/** Giống detect() của server: ngoài dải đo (lỗi cảm biến), vượt ngưỡng, hoặc lệch > 4 độ lệch chuẩn */
export function detect(history: Values[], reading: Values, th: Thresholds): Found[] {
  const recent = history.slice(-SPIKE_WINDOW)
  const out: Found[] = []
  for (const m of METRIC_KEYS) {
    const v = reading[m]
    if (v == null) continue
    const [lo, hi] = th[m] ?? [null, null]
    const [plo, phi] = PHYSICAL[m]
    if (v < plo || (phi != null && v > phi)) out.push({ metric: m, value: v, reason: 'ngoài dải đo, nghi lỗi cảm biến', kind: 'sensor' })
    else if (lo != null && v < lo) out.push({ metric: m, value: v, reason: `dưới ngưỡng ${lo}`, kind: 'threshold' })
    else if (hi != null && v > hi) out.push({ metric: m, value: v, reason: `vượt ngưỡng ${hi}`, kind: 'threshold' })
    else {
      const hist = recent.map(r => r[m]).filter((x): x is number => x != null)
      if (hist.length >= 5) {
        const mu = hist.reduce((a, b) => a + b, 0) / hist.length
        const sd = Math.sqrt(hist.reduce((a, b) => a + (b - mu) ** 2, 0) / hist.length)
        if (sd > 0 && Math.abs(v - mu) / sd > SPIKE_Z) out.push({ metric: m, value: v, reason: `biến động đột ngột (TB ${mu.toFixed(2)})`, kind: 'spike' })
      }
    }
  }
  return out
}

export type Entry = AuditEntry & { prev: string }
const GENESIS = '0'.repeat(64)

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}
const material = (prev: string, e: Pick<Entry, 'ts' | 'kind' | 'device' | 'body'>) => `${prev}|${e.ts}|${e.kind}|${e.device}|${e.body}`

export async function appendEntry(ledger: Entry[], e: Pick<Entry, 'ts' | 'kind' | 'device' | 'body'>): Promise<void> {
  const prev = ledger.at(-1)?.hash ?? GENESIS
  ledger.push({ ...e, seq: ledger.length + 1, prev, hash: await sha256(material(prev, e)) })
}

export async function verifyLedger(ledger: Entry[]): Promise<ChainStatus> {
  let prev = GENESIS
  for (let i = 0; i < ledger.length; i++) {
    const e = ledger[i]
    if (e.prev !== prev || (await sha256(material(prev, e))) !== e.hash) return { ok: false, checked: i, broken_at: e.seq }
    prev = e.hash
  }
  return { ok: true, checked: ledger.length }
}

const gauss = (mu: number, sd: number) => mu + sd * Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
const r2 = (x: number) => Math.round(x * 100) / 100

type Profile = { ph: number; temp: number; tds: number; turbidity: number; flow: number }
/** Giống simulator.py: số đo ổn định quanh mức của từng nhà máy, thỉnh thoảng có sự cố */
function sample(p: Profile, event: 'none' | 'pollution' | 'sensor'): Values {
  const v: Values = { ph: gauss(p.ph, 0.15), temp: gauss(p.temp, 0.5), tds: gauss(p.tds, 30), turbidity: gauss(p.turbidity, 2), flow: gauss(p.flow, 5) }
  if (event === 'pollution') Object.assign(v, { ph: Math.random() < 0.5 ? 3.8 : 10.5, turbidity: 180, tds: 2600 })
  if (event === 'sensor') v.ph = 15.6
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r2(x)]))
}

const DAY = 86400
const TICK_S = 2
const KEEP = 500
type DemoDevice = { id: string; name: string; owner: string; calibrated_ts: number | null; profile: Profile; live: boolean }

function createDemo() {
  const now = Date.now() / 1000
  const devices: DemoDevice[] = [
    { id: 'KCN-01', name: 'Nhà máy dệt nhuộm A', owner: 'KCN Ngũ Huyện Khê', calibrated_ts: now - 10 * DAY, live: true, profile: { ph: 7.2, temp: 29, tds: 800, turbidity: 25, flow: 120 } },
    { id: 'KCN-02', name: 'Nhà máy giấy B', owner: 'KCN Phong Khê', calibrated_ts: now - 41 * DAY, live: true, profile: { ph: 7.6, temp: 31, tds: 1150, turbidity: 38, flow: 95 } },
    { id: 'KCN-03', name: 'Nhà máy chế biến thủy sản C', owner: 'CCN Tân Hồng', calibrated_ts: null, live: false, profile: { ph: 6.9, temp: 27, tds: 1400, turbidity: 30, flow: 60 } },
  ]
  let thresholds: Thresholds = structuredClone(DEMO_THRESHOLDS)
  const readings: Record<string, Reading[]> = Object.fromEntries(devices.map(d => [d.id, []]))
  const alerts: Alert[] = []
  const ledger: Entry[] = []
  let nextAlert = 1

  // Ghi tuần tự để chuỗi băm không bị xen kẽ giữa các lần gọi bất đồng bộ
  let queue = Promise.resolve()
  const write = (kind: string, device: string | null, data: object, ts = Date.now() / 1000) =>
    (queue = queue.then(() => appendEntry(ledger, { ts, kind, device, body: JSON.stringify(data) })))

  const ingest = (d: DemoDevice, ts: number, event: 'none' | 'pollution' | 'sensor') => {
    const v = sample(d.profile, event)
    for (const a of detect(readings[d.id], v, thresholds)) alerts.unshift({ id: nextAlert++, ts, device: d.id, status: 'new', note: '', closed_ts: null, ...a })
    readings[d.id].push({ ts, ...v })
    if (readings[d.id].length > KEEP) readings[d.id].shift()
    write('reading', d.id, v, ts)
  }

  // Lịch sử sẵn có: 2 phút gần nhất cho 2 nhà máy đang chạy; nhà máy C mất tín hiệu từ 2 giờ trước
  for (const d of devices) write('device_add', d.id, { name: d.name, owner: d.owner }, now - 60 * DAY)
  for (const d of devices) if (d.calibrated_ts) write('calibration', d.id, { note: 'Hiệu chuẩn pH 4.01/7.00, TDS 1413 µS/cm' }, d.calibrated_ts)
  for (let i = 60; i > 0; i--) {
    for (const d of devices) {
      const ts = d.live ? now - i * TICK_S : now - 2 * 3600 - i * 60
      ingest(d, ts, d.id === 'KCN-02' && i === 40 ? 'pollution' : d.id === 'KCN-01' && i === 25 ? 'sensor' : d.id === 'KCN-03' && i === 10 ? 'pollution' : 'none')
    }
  }
  // Một số cảnh báo cũ đã được xử lý để các chỉ số thí điểm có dữ liệu
  const close = (a: Alert, status: AlertStatus, note: string, after: number) => Object.assign(a, { status, note, closed_ts: a.ts + after })
  for (const a of alerts) {
    if (a.kind === 'sensor') close(a, 'false_alarm', 'Đầu dò pH bám bẩn, đã vệ sinh. Mẫu tay pH 7.1.', 25 * 60)
    else if (a.device === 'KCN-02') close(a, 'resolved', 'Bơm định lượng NaOH bị kẹt van, đã thay. Giữ nước ở bể 40 phút trước khi xả.', 42 * 60)
  }

  setInterval(() => {
    const ts = Date.now() / 1000
    for (const d of devices) if (d.live) ingest(d, ts, Math.random() < 0.025 ? 'pollution' : Math.random() < 0.006 ? 'sensor' : 'none')
  }, TICK_S * 1000)

  const settle = <T,>(v: T) => queue.then(() => structuredClone(v))
  const needKey = (key: string) => { if (!key) throw new Error('Nhập khóa quản trị') }
  const isOpen = (a: Alert) => a.status === 'new' || a.status === 'investigating'

  return {
    devices: () =>
      settle(devices.map((d): Device => {
        const last = readings[d.id].at(-1)
        return { id: d.id, name: d.name, owner: d.owner, calibrated_ts: d.calibrated_ts, last_ts: last?.ts ?? null, last: last ?? null, open_alerts: alerts.filter(a => a.device === d.id && isOpen(a)).length }
      })),
    readings: (device: string, limit = 200) => settle((readings[device] ?? []).slice(-limit)),
    alerts: () => settle(alerts.slice(0, 500)),
    thresholds: () => settle(thresholds),
    verify: () => queue.then(() => verifyLedger(ledger)),
    audit: () => settle(ledger.filter(e => e.kind !== 'reading').slice(-200).reverse().map(e => ({ seq: e.seq, ts: e.ts, kind: e.kind, device: e.device, body: e.body, hash: e.hash }))),
    // Bản demo nhận mọi khóa khác rỗng; bản thật kiểm tra khóa ở server
    updateAlert: async (id: number, status: AlertStatus, note: string, key: string) => {
      needKey(key)
      const a = alerts.find(x => x.id === id)
      if (!a) throw new Error('Không có cảnh báo này')
      Object.assign(a, { status, note, closed_ts: status === 'resolved' || status === 'false_alarm' ? Date.now() / 1000 : null })
      await write('alert_update', null, { id, status, note })
      return { ok: true as const }
    },
    calibrate: async (id: string, note: string, key: string) => {
      needKey(key)
      const d = devices.find(x => x.id === id)
      if (!d) throw new Error('Không có thiết bị này')
      d.calibrated_ts = Date.now() / 1000
      await write('calibration', id, { note })
      return { calibrated_ts: d.calibrated_ts }
    },
    setThresholds: async (th: Thresholds, key: string) => {
      needKey(key)
      for (const [m, [lo, hi]] of Object.entries(th) as [MetricKey, [number | null, number | null]][])
        if (lo != null && hi != null && lo > hi) throw new Error(`Ngưỡng dưới của ${m} lớn hơn ngưỡng trên`)
      thresholds = { ...thresholds, ...th }
      await write('threshold_change', null, th)
      return { ok: true as const }
    },
    addDevice: async (d: { id: string; name: string; owner: string }, key: string) => {
      needKey(key)
      if (devices.some(x => x.id === d.id)) throw new Error('Mã thiết bị đã tồn tại')
      devices.push({ ...d, calibrated_ts: null, live: true, profile: { ph: 7.1, temp: 28, tds: 700, turbidity: 20, flow: 80 } })
      readings[d.id] = []
      await write('device_add', d.id, { name: d.name, owner: d.owner })
      return { id: d.id, key: 'demo-' + Math.random().toString(36).slice(2, 10) }
    },
  }
}

let instance: ReturnType<typeof createDemo> | null = null
export const demoApi = () => (instance ??= createDemo())
