import { useCallback, useEffect, useState } from 'react'
import { api, DEMO, type ChainStatus } from '../lib/api'
import { ago } from '../lib/metrics'
import { useNow } from '../hooks/useNow'
import type { ThemeChoice } from '../hooks/useTheme'

type Props = { online: boolean | null; lastTs: number | null; theme: ThemeChoice; onTheme: (t: ThemeChoice) => void }

export function Header({ online, lastTs, theme, onTheme }: Props) {
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-20 border-b border-line bg-bg/80 backdrop-blur-xl backdrop-saturate-150 max-sm:static">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-3 px-[max(16px,env(safe-area-inset-left,0px))] py-3">
        <div className="mr-auto flex items-center gap-2.5">
          <Logo />
          <div>
            <div className="font-display text-[19px] font-extrabold leading-none tracking-tight">AQUA CARE</div>
            <div className="mt-0.5 text-xs text-muted">Giám sát nước thải sau xử lý · bể chứa cuối</div>
          </div>
        </div>
        {DEMO && (
          <span className="rounded-full border border-warn/50 bg-warn/10 px-2.5 py-1 text-xs font-semibold text-warn" title="Bản trình diễn: số đo được giả lập trong trình duyệt, không phải dữ liệu thật">
            Bản demo · dữ liệu giả lập
          </span>
        )}
        <LiveStatus online={online} lastTs={lastTs} />
        <IntegrityButton />
        <ThemeToggle value={theme} onChange={onTheme} />
      </div>
    </header>
  )
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-[30px] w-[30px]" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(var(--accent2))" />
          <stop offset="1" stopColor="rgb(var(--accent))" />
        </linearGradient>
      </defs>
      <path d="M16 3c5 6.5 9 11.3 9 16a9 9 0 0 1-18 0c0-4.7 4-9.5 9-16z" fill="url(#logo-g)" />
      <path d="M10.5 20.5c1.6 1.4 3.4 1.4 5 0s3.4-1.4 5 0" stroke="rgb(var(--surface))" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function LiveStatus({ online, lastTs }: { online: boolean | null; lastTs: number | null }) {
  const now = useNow()
  const stale = online === false
  const text = online === null ? 'Đang kết nối…' : stale ? 'Mất kết nối server' : lastTs ? `Trực tiếp · cập nhật ${ago(lastTs, now)}` : 'Đã kết nối · chưa có số đo'
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] text-muted" role="status">
      <span className={`relative h-2 w-2 rounded-full ${stale ? 'bg-warn' : 'bg-ok'}`}>
        <span className={`absolute -inset-[5px] rounded-full border-2 animate-ring ${stale ? 'border-warn' : 'border-ok'}`} />
      </span>
      {text}
    </span>
  )
}

function IntegrityButton() {
  const [state, setState] = useState<'busy' | 'error' | ChainStatus>('busy')

  const check = useCallback(async () => {
    setState('busy')
    try {
      // chờ tối thiểu 500ms để người dùng thấy là đã kiểm tra lại
      const [r] = await Promise.all([api.verify(), new Promise(ok => setTimeout(ok, 500))])
      setState(r)
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => {
    check()
  }, [check])

  const bad = state === 'error' || (typeof state === 'object' && !state.ok)
  const label =
    state === 'busy' ? 'Đang kiểm tra…'
    : state === 'error' ? 'Không kiểm tra được'
    : state.ok ? `Dữ liệu toàn vẹn · ${state.checked.toLocaleString('vi-VN')} bản ghi`
    : `Phát hiện sửa dữ liệu tại bản ghi #${state.broken_at}`

  return (
    <button
      type="button"
      onClick={check}
      title="Kiểm tra chuỗi băm SHA-256 của toàn bộ dữ liệu"
      data-ripple
      className={`relative inline-flex items-center gap-2 overflow-hidden rounded-full border px-3 py-1.5 text-[13px] font-medium transition hover:-translate-y-px active:scale-[.98]
        ${bad ? 'animate-shake border-bad bg-bad/10 text-bad' : typeof state === 'object' ? 'border-ok/50 bg-surface text-ok' : 'border-line bg-surface text-ink'}`}
    >
      <svg viewBox="0 0 24 24" className={`h-4 w-4 flex-none ${state === 'busy' ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
        <path d={bad ? 'M9.5 9.5l5 5m0-5l-5 5' : 'M8.5 12l2.5 2.5 4.5-5'} />
      </svg>
      {label}
    </button>
  )
}

const THEMES: { id: ThemeChoice; label: string; icon: string }[] = [
  { id: 'system', label: 'Theo máy', icon: 'M4 5h16v11H4zM9 20h6M12 16v4' },
  { id: 'light', label: 'Sáng', icon: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7l1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2l-1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z' },
  { id: 'dark', label: 'Tối', icon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z' },
]

function ThemeToggle({ value, onChange }: { value: ThemeChoice; onChange: (t: ThemeChoice) => void }) {
  return (
    <div role="radiogroup" aria-label="Giao diện" className="inline-flex rounded-full border border-line bg-surface p-0.5">
      {THEMES.map(t => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={value === t.id}
          title={t.label}
          onClick={() => onChange(t.id)}
          className={`grid h-7 w-7 place-items-center rounded-full transition ${value === t.id ? 'bg-accent text-surface' : 'text-muted hover:text-ink'}`}
        >
          <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={t.icon} />
          </svg>
          <span className="sr-only">{t.label}</span>
        </button>
      ))}
    </div>
  )
}
