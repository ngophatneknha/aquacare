import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { prefersReducedMotion } from './lib/color'
import { METRICS, fmt, isMetric } from './lib/metrics'
import { isOpen } from './lib/kpi'
import { useAquaData } from './hooks/useAquaData'
import { useTheme } from './hooks/useTheme'
import { useAdmin } from './hooks/useAdmin'
import { usePage, type PageId } from './hooks/usePage'
import { useNow } from './hooks/useNow'
import { AppContext, type Notice } from './context'
import { Header } from './components/Header'
import { Toasts } from './components/Toasts'
import { AdminKeyDialog } from './components/AdminKeyDialog'
import { Overview } from './pages/Overview'
import { Monitor } from './pages/Monitor'
import { Alerts } from './pages/Alerts'
import { Devices } from './pages/Devices'
import { Audit } from './pages/Audit'

export default function App() {
  const { choice, setChoice, resolved } = useTheme()
  const { page, go } = usePage()
  const admin = useAdmin()
  const [selected, setSelected] = useState<string | null>(null)
  const [focusAlert, setFocusAlert] = useState<number | null>(null)
  const { devices, device, readings, alerts, thresholds, online, refresh } = useAquaData(selected)
  const now = useNow() / 1000

  const [toasts, setToasts] = useState<Notice[]>([])
  const nextToast = useRef(1)
  const notify = useCallback((n: Omit<Notice, 'id'>) => setToasts(t => [...t, { ...n, id: nextToast.current++ }].slice(-4)), [])
  const dropToast = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), [])

  // Cảnh báo mới (id lớn hơn lần trước) → trượt vào danh sách + hiện toast. Lần tải đầu không tính.
  const maxSeen = useRef<number | null>(null)
  const [fresh, setFresh] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (online === null) return
    const top = alerts[0]?.id ?? 0
    if (maxSeen.current !== null && top > maxSeen.current) {
      const prev = maxSeen.current
      const added = alerts.filter(a => a.id > prev)
      setFresh(new Set(added.map(a => a.id)))
      for (const a of added.slice(0, 3).reverse())
        notify({ tone: 'bad', title: a.device, text: `${isMetric(a.metric) ? METRICS[a.metric].label : a.metric} ${fmt(a.metric, a.value)} ${a.reason}` })
    }
    maxSeen.current = Math.max(maxSeen.current ?? 0, top)
  }, [alerts, online, notify])

  const open = useCallback((p: PageId, target?: { device?: string; alert?: number }) => {
    if (target?.device) setSelected(target.device)
    setFocusAlert(target?.alert ?? null)
    go(p)
  }, [go])

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

  const ctx = useMemo(() => ({ runAdmin: admin.run, notify, open, refresh, theme: resolved }), [admin.run, notify, open, refresh, resolved])
  const lastTs = devices.reduce<number | null>((m, d) => (d.last_ts != null && (m == null || d.last_ts > m) ? d.last_ts : m), null)

  return (
    <AppContext.Provider value={ctx}>
      <Header
        online={online} lastTs={lastTs} theme={choice} onTheme={setChoice}
        page={page} onPage={p => open(p)} openAlerts={alerts.filter(isOpen).length}
      />
      <main key={page} className="mx-auto max-w-[1320px] px-[max(16px,env(safe-area-inset-left,0px))] pb-10 pt-5">
        {page === 'tong-quan' && <Overview devices={devices} alerts={alerts} now={now} />}
        {page === 'giam-sat' && (
          <Monitor devices={devices} device={device} readings={readings} alerts={alerts} thresholds={thresholds} now={now} fresh={fresh} onSelect={setSelected} />
        )}
        {page === 'canh-bao' && <Alerts alerts={alerts} devices={devices} thresholds={thresholds} now={now} fresh={fresh} focus={focusAlert} />}
        {page === 'thiet-bi' && <Devices devices={devices} thresholds={thresholds} now={now} />}
        {page === 'nhat-ky' && <Audit />}
      </main>
      <Toasts items={toasts} onDone={dropToast} />
      <AdminKeyDialog open={admin.asking} onSubmit={admin.submit} onClose={admin.cancel} />
    </AppContext.Provider>
  )
}
