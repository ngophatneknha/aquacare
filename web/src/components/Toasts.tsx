import { useEffect, useState } from 'react'
import type { Notice } from '../context'

const SHOW_MS = 4500

export function Toasts({ items, onDone }: { items: Notice[]; onDone: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-[calc(16px+env(safe-area-inset-bottom,0px))] right-[max(16px,env(safe-area-inset-right,0px))] z-30 grid w-[min(360px,calc(100vw-32px))] gap-2"
    >
      {items.map(n => <Toast key={n.id} notice={n} onDone={onDone} />)}
    </div>
  )
}

function Toast({ notice: n, onDone }: { notice: Notice; onDone: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), SHOW_MS)
    const t2 = setTimeout(() => onDone(n.id), SHOW_MS + 400)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [n.id, onDone])

  return (
    <div className={`rounded-xl border bg-surface px-3.5 py-3 shadow-card ${n.tone === 'bad' ? 'border-bad' : 'border-ok'} ${leaving ? 'animate-toast-out' : 'animate-toast-in'}`}>
      <b className={n.tone === 'bad' ? 'text-bad' : 'text-ok'}>{n.tone === 'bad' ? '⚠ ' : '✓ '}{n.title}</b>
      {n.text && <span className="text-ink"> · {n.text}</span>}
    </div>
  )
}
