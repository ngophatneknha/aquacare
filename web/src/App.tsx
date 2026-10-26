import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type Alert } from './lib/api'
import { prefersReducedMotion } from './lib/color'
import { useAquaData } from './hooks/useAquaData'
import { useTheme } from './hooks/useTheme'
import { Header } from './components/Header'
import { PhTank } from './components/PhTank'
import { Gauge } from './components/Gauge'
import { DeviceList } from './components/DeviceList'
import { TrendChart } from './components/TrendChart'
import { AlertList } from './components/AlertList'
import { Toasts } from './components/Toasts'
import { AdminKeyDialog } from './components/AdminKeyDialog'

const GAUGES = ['temp', 'tds', 'turbidity', 'flow'] as const
const KEY_STORE = 'aquacare-admin-key'

export default function App() {
  const { choice, setChoice, resolved } = useTheme()
  const [selected, setSelected] = useState<string | null>(null)
  const { devices, device, readings, alerts, thresholds, online, refresh } = useAquaData(selected)
  const current = devices.find(d => d.id === device)
  const last = readings.at(-1)

  // Cảnh báo mới (id lớn hơn lần trước) → trượt vào danh sách + hiện toast. Lần tải đầu không tính.
  const maxSeen = useRef<number | null>(null)
  const [fresh, setFresh] = useState<Set<number>>(new Set())
  const [toasts, setToasts] = useState<Alert[]>([])
  useEffect(() => {
    if (online === null) return
    const top = alerts[0]?.id ?? 0
    if (maxSeen.current !== null && top > maxSeen.current) {
      const prev = maxSeen.current
      const added = alerts.filter(a => a.id > prev)
      setFresh(new Set(added.map(a => a.id)))
      setToasts(t => [...t, ...added.slice(0, 3).reverse()].slice(-4))
    }
    maxSeen.current = Math.max(maxSeen.current ?? 0, top)
  }, [alerts, online])
  const dropToast = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), [])

  // Xác nhận cảnh báo: thử khóa đã nhớ trong phiên, sai thì hỏi lại
  const [ackId, setAckId] = useState<number | null>(null)
  const ack = useCallback(async (id: number) => {
    let saved: string | null = null
    try { saved = sessionStorage.getItem(KEY_STORE) } catch { /* không có sessionStorage */ }
    if (saved && (await api.ack(id, saved).catch(() => false))) return refresh()
    setAckId(id)
  }, [refresh])
  const submitKey = useCallback(async (key: string) => {
    if (ackId == null || !(await api.ack(ackId, key))) return false
    try { sessionStorage.setItem(KEY_STORE, key) } catch { /* bỏ qua */ }
    setAckId(null)
    refresh()
    return true
  }, [ackId, refresh])

  // Hiệu ứng gợn sóng khi bấm nút
  useEffect(() => {
    const on = (e: PointerEvent) => {
      const b = (e.target as Element).closest<HTMLElement>('.btn, [data-ripple]')
      if (!b || prefersReducedMotion()) return
      const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height), s = document.createElement('span')
      s.className = 'ripple'
      Object.assign(s.style, { width: `${d}px`, height: `${d}px`, left: `${e.clientX - r.left - d / 2}px`, top: `${e.clientY - r.top - d / 2}px` })
      b.appendChild(s)
      setTimeout(() => s.remove(), 650)
    }
    document.addEventListener('pointerdown', on)
    return () => document.removeEventListener('pointerdown', on)
  }, [])

  const history = useMemo(
    () => Object.fromEntries(GAUGES.map(m => [m, readings.map(r => r[m])])) as Record<(typeof GAUGES)[number], (number | undefined)[]>,
    [readings],
  )

  return (
    <>
      <Header online={online} lastTs={last?.ts ?? null} theme={choice} onTheme={setChoice} />
      <main className="mx-auto grid max-w-[1320px] gap-[18px] px-[max(16px,env(safe-area-inset-left,0px))] pb-10 pt-5">
        <section className="grid gap-[18px] lg:grid-cols-[minmax(280px,1.05fr)_2fr]">
          <PhTank device={current} ph={last?.ph} thresholds={thresholds} theme={resolved} />
          <div className="grid gap-[18px] sm:grid-cols-2">
            {GAUGES.map((m, i) => (
              <Gauge key={m} metric={m} history={history[m]} thresholds={thresholds} theme={resolved} delay={0.05 + i * 0.06} />
            ))}
          </div>
        </section>
        <section className="grid gap-[18px] lg:grid-cols-[300px_minmax(0,1fr)]">
          <DeviceList devices={devices} selected={device} onSelect={setSelected} />
          <TrendChart readings={readings} thresholds={thresholds} theme={resolved} />
        </section>
        <AlertList alerts={alerts} fresh={fresh} onAck={ack} />
      </main>
      <Toasts items={toasts} onDone={dropToast} />
      <AdminKeyDialog open={ackId !== null} onSubmit={submitKey} onClose={() => setAckId(null)} />
    </>
  )
}
