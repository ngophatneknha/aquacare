import type { Alert } from '../lib/api'
import { METRICS, fmt, isMetric } from '../lib/metrics'

type Props = { alerts: Alert[]; fresh: Set<number>; onAck: (id: number) => void }

export function AlertList({ alerts, fresh, onAck }: Props) {
  const open = alerts.filter(a => !a.ack).length
  return (
    <section className="panel animate-rise" style={{ animationDelay: '.3s' }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <h3 className="font-display text-base font-bold">Cảnh báo</h3>
        {alerts.length > 0 && <span className="eyebrow">{open} chưa xử lý · {alerts.length} gần nhất</span>}
      </div>
      {alerts.length === 0 ? (
        <p className="px-4 py-6 text-muted">Chưa có cảnh báo nào. Mọi chỉ số đang trong ngưỡng.</p>
      ) : (
        <ul className="grid max-h-[420px] gap-2 overflow-y-auto px-4 pb-4 pt-2">
          {alerts.map(a => {
            const meta = isMetric(a.metric) ? METRICS[a.metric] : null
            const done = a.ack === 1
            return (
              <li
                key={a.id}
                className={`relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-[10px] border border-line bg-sunk px-3 py-2.5
                  ${done ? 'opacity-60' : ''} ${fresh.has(a.id) ? 'animate-slide' : ''}`}
              >
                <span className={`absolute inset-y-0 left-0 w-[3px] ${done ? 'bg-ok' : 'bg-bad'}`} />
                <span className={`num grid h-[34px] w-[34px] place-items-center rounded-[9px] text-xs font-bold ${done ? 'bg-ok/15 text-ok' : 'bg-bad/15 text-bad'}`}>
                  {meta?.short ?? '!'}
                </span>
                <div className="min-w-0">
                  <b className="font-semibold">
                    {meta?.label ?? a.metric} <span className="num">{fmt(a.metric, a.value)}</span> {meta?.unit}
                  </b>{' '}
                  · {a.reason}
                  <small className="block truncate text-xs text-muted">
                    {a.device} · {new Date(a.ts * 1000).toLocaleString('vi-VN')}
                  </small>
                </div>
                {done ? (
                  <span className="whitespace-nowrap text-[12.5px] font-semibold text-ok">✓ Đã xử lý</span>
                ) : (
                  <button type="button" className="btn" onClick={() => onAck(a.id)}>Xác nhận</button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
