// Bản demo chạy hoàn toàn trong trình duyệt (dùng khi deploy tĩnh lên Netlify, không có server Python).
// Logic phát hiện bất thường và chuỗi băm bám theo server/app.py.
import type { Alert, ChainStatus, Device, MetricKey, Reading, Thresholds, Values } from './api'
import { METRIC_KEYS } from './metrics'

export const DEMO_THRESHOLDS: Thresholds = { ph: [5.5, 9], temp: [null, 40], tds: [null, 2000], turbidity: [null, 100], flow: [null, null] }
const SPIKE_WINDOW = 20
const SPIKE_Z = 4

/** Giống detect() của server: vượt ngưỡng, hoặc lệch > 4 độ lệch chuẩn so với 20 mẫu trước */
export function detect(history: Values[], reading: Values, th: Thresholds): { metric: MetricKey; value: number; reason: string }[] {
  const recent = history.slice(-SPIKE_WINDOW)
  const out: { metric: MetricKey; value: number; reason: string }[] = []
  for (const m of METRIC_KEYS) {
    const v = reading[m]
    if (v == null) continue
    const [lo, hi] = th[m] ?? [null, null]
    if (lo != null && v < lo) out.push({ metric: m, value: v, reason: `dưới ngưỡng ${lo}` })
    else if (hi != null && v > hi) out.push({ metric: m, value: v, reason: `vượt ngưỡng ${hi}` })
    else {
      const hist = recent.map(r => r[m]).filter((x): x is number => x != null)
      if (hist.length >= 5) {
        const mu = hist.reduce((a, b) => a + b, 0) / hist.length
        const sd = Math.sqrt(hist.reduce((a, b) => a + (b - mu) ** 2, 0) / hist.length)
        if (sd > 0 && Math.abs(v - mu) / sd > SPIKE_Z) out.push({ metric: m, value: v, reason: `biến động đột ngột (TB ${mu.toFixed(2)})` })
      }
    }
  }
  return out
}

type Entry = { prev: string; body: string; hash: string }
const GENESIS = '0'.repeat(64)

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function appendEntry(ledger: Entry[], body: string): Promise<void> {
  const prev = ledger.at(-1)?.hash ?? GENESIS
  ledger.push({ prev, body, hash: await sha256(`${prev}|${body}`) })
}

export async function verifyLedger(ledger: Entry[]): Promise<ChainStatus> {
  let prev = GENESIS
  for (let i = 0; i < ledger.length; i++) {
    const e = ledger[i]
    if (e.prev !== prev || (await sha256(`${prev}|${e.body}`)) !== e.hash) return { ok: false, checked: i, broken_at: i + 1 }
    prev = e.hash
  }
  return { ok: true, checked: ledger.length }
}

const gauss = (mu: number, sd: number) => mu + sd * Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
const r2 = (x: number) => Math.round(x * 100) / 100

/** Giống simulator.py: số đo ổn định, thỉnh thoảng có sự cố xả nước thải chưa xử lý */
function sample(incident: boolean): Values {
  const v: Values = { ph: gauss(7.2, 0.15), temp: gauss(29, 0.5), tds: gauss(800, 30), turbidity: gauss(25, 2), flow: gauss(120, 5) }
  if (incident) Object.assign(v, { ph: Math.random() < 0.5 ? 3.8 : 10.5, turbidity: 180, tds: 2600 })
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r2(x)]))
}

const DEVICES = [
  { id: 'KCN-01', name: 'Nhà máy dệt nhuộm A', owner: 'KCN Ngũ Huyện Khê' },
  { id: 'KCN-02', name: 'Nhà máy giấy B', owner: 'KCN Phong Khê' },
]
const TICK_S = 2
const KEEP = 500

function createDemo() {
  const readings: Record<string, Reading[]> = Object.fromEntries(DEVICES.map(d => [d.id, []]))
  const alerts: Alert[] = []
  const ledger: Entry[] = []
  let nextAlert = 1

  // Ghi tuần tự để chuỗi băm không bị xen kẽ giữa các lần gọi bất đồng bộ
  let queue = Promise.resolve()
  const write = (body: string) => (queue = queue.then(() => appendEntry(ledger, body)))

  const ingest = (device: string, ts: number, incident: boolean) => {
    const v = sample(incident)
    for (const a of detect(readings[device], v, DEMO_THRESHOLDS)) alerts.unshift({ id: nextAlert++, ts, device, ack: 0, ...a })
    readings[device].push({ ts, ...v })
    if (readings[device].length > KEEP) readings[device].shift()
    write(JSON.stringify({ kind: 'reading', device, ts, ...v }))
  }

  // Có sẵn 2 phút lịch sử để biểu đồ đầy ngay khi mở, kèm một sự cố mẫu
  const now = Date.now() / 1000
  for (let i = 60; i > 0; i--) for (const d of DEVICES) ingest(d.id, now - i * TICK_S, d.id === 'KCN-02' && i === 18)
  setInterval(() => {
    const ts = Date.now() / 1000
    for (const d of DEVICES) ingest(d.id, ts, Math.random() < 0.03)
  }, TICK_S * 1000)

  const delay = <T,>(v: T) => queue.then(() => structuredClone(v))
  return {
    devices: () =>
      delay(DEVICES.map((d): Device => {
        const last = readings[d.id].at(-1)
        return { ...d, last_ts: last?.ts ?? null, last: last ?? null, open_alerts: alerts.filter(a => a.device === d.id && !a.ack).length }
      })),
    readings: (device: string, limit = 200) => delay((readings[device] ?? []).slice(-limit)),
    alerts: () => delay(alerts.slice(0, 200)),
    thresholds: () => delay(DEMO_THRESHOLDS),
    verify: () => queue.then(() => verifyLedger(ledger)),
    // Bản demo nhận mọi khóa khác rỗng; bản thật kiểm tra khóa ở server
    ack: async (id: number, adminKey: string) => {
      if (!adminKey) return false
      const a = alerts.find(x => x.id === id)
      if (a) a.ack = 1
      await write(JSON.stringify({ kind: 'alert_ack', id }))
      return true
    },
  }
}

let instance: ReturnType<typeof createDemo> | null = null
export const demoApi = () => (instance ??= createDemo())
