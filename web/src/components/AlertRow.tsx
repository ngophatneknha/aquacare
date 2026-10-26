import type { Alert } from '../lib/api'
import { METRICS, ago, fmt, isMetric } from '../lib/metrics'
import { isOpen } from '../lib/kpi'
import { KindChip, StatusChip } from './Chips'
import { STATUS_LABEL } from '../lib/labels'

type Props = { alert: Alert; now: number; selected?: boolean; fresh?: boolean; onClick: () => void }

export function AlertRow({ alert: a, now, selected, fresh, onClick }: Props) {
  const meta = isMetric(a.metric) ? METRICS[a.metric] : null
  const open = isOpen(a)
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-label={`${meta?.label ?? a.metric} ${fmt(a.metric, a.value)} ${meta?.unit ?? ''}, ${a.device}, ${a.reason}, trạng thái ${STATUS_LABEL[a.status]}`}
        className={`relative grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-[10px] border px-3 py-2.5 text-left transition hover:border-accent/50
          ${selected ? 'border-accent bg-accent/10' : 'border-line bg-sunk'} ${open ? '' : 'opacity-70'} ${fresh ? 'animate-slide' : ''}`}
      >
        <span className={`absolute inset-y-0 left-0 w-[3px] ${a.kind === 'sensor' ? 'bg-accent' : open ? 'bg-bad' : 'bg-ok'}`} />
        <span className={`num grid h-[34px] w-[34px] place-items-center rounded-[9px] text-xs font-bold ${a.kind === 'sensor' ? 'bg-accent/15 text-accent' : open ? 'bg-bad/15 text-bad' : 'bg-ok/15 text-ok'}`}>
          {meta?.short ?? '!'}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <b className="font-semibold">
              {meta?.label ?? a.metric} <span className="num">{fmt(a.metric, a.value)}</span> {meta?.unit}
            </b>
            <KindChip kind={a.kind} />
            <StatusChip status={a.status} />
          </span>
          <small className="block truncate text-xs text-muted">
            {a.device} · {a.reason} · {ago(a.ts, now * 1000)}
          </small>
        </span>
      </button>
    </li>
  )
}
