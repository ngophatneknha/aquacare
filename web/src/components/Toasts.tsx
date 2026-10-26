import { useEffect, useState } from 'react'
import type { Alert } from '../lib/api'
import { METRICS, fmt, isMetric } from '../lib/metrics'

const SHOW_MS = 4500

export function Toasts({ items, onDone }: { items: Alert[]; onDone: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-[calc(16px+env(safe-area-inset-bottom,0px))] right-[max(16px,env(safe-area-inset-right,0px))] z-30 grid w-[min(360px,calc(100vw-32px))] gap-2"
    >
      {items.map(a => <Toast key={a.id} alert={a} onDone={onDone} />)}
    </div>
  )
}

function Toast({ alert: a, onDone }: { alert: Alert; onDone: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), SHOW_MS)
    const t2 = setTimeout(() => onDone(a.id), SHOW_MS + 400)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [a.id, onDone])

  return (
    <div className={`rounded-xl border border-bad bg-surface px-3.5 py-3 shadow-card ${leaving ? 'animate-toast-out' : 'animate-toast-in'}`}>
      <b className="text-bad">⚠ {a.device}</b> · {isMetric(a.metric) ? METRICS[a.metric].label : a.metric}{' '}
      <span className="num">{fmt(a.metric, a.value)}</span> {a.reason}
    </div>
  )
}
