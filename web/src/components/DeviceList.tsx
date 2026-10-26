import type { Device } from '../lib/api'
import { ago, fmt } from '../lib/metrics'
import { useNow } from '../hooks/useNow'
import { isOnline } from '../lib/kpi'

type Props = { devices: Device[]; selected: string | null; onSelect: (id: string) => void }

export function DeviceList({ devices, selected, onSelect }: Props) {
  const now = useNow()
  return (
    <section className="panel animate-rise" style={{ animationDelay: '.15s' }}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <h3 className="font-display text-base font-bold">Điểm quan trắc</h3>
        {devices.length > 0 && <span className="eyebrow">{devices.length} thiết bị</span>}
      </div>
      {devices.length === 0 ? (
        <p className="px-4 py-6 text-muted">
          Chưa có thiết bị nào gửi dữ liệu. Chạy <code className="num text-ink">python simulator.py</code> để thử.
        </p>
      ) : (
        <div className="grid gap-2 p-3">
          {devices.map(d => {
            const sel = d.id === selected
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={sel}
                onClick={() => onSelect(d.id)}
                className={`relative grid w-full gap-0.5 rounded-[10px] border py-3 pl-4 pr-3 text-left transition duration-200 ease-out hover:translate-x-[3px]
                  ${sel ? 'border-accent bg-accent/10' : 'border-line bg-sunk hover:border-accent/45'}`}
              >
                <span className={`absolute inset-y-2.5 left-0 w-[3px] rounded-full ${d.open_alerts ? 'bg-bad' : isOnline(d, now / 1000) ? 'bg-ok' : 'bg-muted'}`} />
                {d.open_alerts > 0 && (
                  <span key={d.open_alerts} className="num absolute right-2.5 top-2.5 rounded-full bg-bad px-2 text-[11px] font-semibold text-white animate-pop">
                    {d.open_alerts}
                  </span>
                )}
                <b className="pr-8 font-semibold">{d.name || d.id}</b>
                <small className="text-xs text-muted">{d.id} · {d.owner}</small>
                <small className="num text-xs text-muted">
                  {d.last && d.last_ts ? `pH ${fmt('ph', d.last.ph)} · ${ago(d.last_ts, now)}` : 'chưa có dữ liệu'}
                </small>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
