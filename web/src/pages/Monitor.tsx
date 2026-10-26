import { useMemo } from 'react'
import type { Alert, Device, Reading, Thresholds } from '../lib/api'
import { readingsCsv, download } from '../lib/csv'
import { isOpen } from '../lib/kpi'
import { useApp } from '../context'
import { PhTank } from '../components/PhTank'
import { Gauge } from '../components/Gauge'
import { DeviceList } from '../components/DeviceList'
import { TrendChart } from '../components/TrendChart'
import { AlertRow } from '../components/AlertRow'

const GAUGES = ['temp', 'tds', 'turbidity', 'flow'] as const

type Props = {
  devices: Device[]; device: string | null; readings: Reading[]; alerts: Alert[]; thresholds: Thresholds
  now: number; fresh: Set<number>; onSelect: (id: string) => void
}

export function Monitor({ devices, device, readings, alerts, thresholds, now, fresh, onSelect }: Props) {
  const app = useApp()
  const current = devices.find(d => d.id === device)
  const last = readings.at(-1)
  const history = useMemo(
    () => Object.fromEntries(GAUGES.map(m => [m, readings.map(r => r[m])])) as Record<(typeof GAUGES)[number], (number | undefined)[]>,
    [readings],
  )
  const mine = alerts.filter(a => a.device === device && isOpen(a)).slice(0, 5)

  const exportCsv = () => {
    if (!device || !readings.length) return
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    download(`aquacare_${device}_${stamp}.csv`, readingsCsv(device, readings))
    app.notify({ tone: 'ok', title: `Đã xuất ${readings.length} số đo`, text: device })
  }

  return (
    <div className="grid gap-[18px]">
      <section className="grid gap-[18px] lg:grid-cols-[minmax(280px,1.05fr)_2fr]">
        <PhTank device={current} ph={last?.ph} thresholds={thresholds} theme={app.theme} />
        <div className="grid gap-[18px] sm:grid-cols-2">
          {GAUGES.map((m, i) => (
            <Gauge key={m} metric={m} history={history[m]} thresholds={thresholds} theme={app.theme} delay={0.05 + i * 0.06} />
          ))}
        </div>
      </section>
      <section className="grid gap-[18px] lg:grid-cols-[300px_minmax(0,1fr)]">
        <DeviceList devices={devices} selected={device} onSelect={onSelect} />
        <TrendChart
          readings={readings}
          thresholds={thresholds}
          theme={app.theme}
          actions={
            <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!readings.length} title="Tải số đo đang hiển thị về file CSV (mở được bằng Excel)">
              Xuất CSV
            </button>
          }
        />
      </section>
      <section className="panel animate-rise" style={{ animationDelay: '.3s' }}>
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <h3 className="font-display text-base font-bold">Cảnh báo đang mở · {device ?? '—'}</h3>
          <button type="button" className="text-[13px] font-semibold text-accent hover:underline" onClick={() => app.open('canh-bao')}>Tất cả cảnh báo →</button>
        </div>
        {mine.length === 0 ? (
          <p className="px-4 py-6 text-muted">Thiết bị này không có cảnh báo nào đang mở.</p>
        ) : (
          <ul className="grid gap-2 p-4 pt-3">
            {mine.map(a => <AlertRow key={a.id} alert={a} now={now} fresh={fresh.has(a.id)} onClick={() => app.open('canh-bao', { alert: a.id })} />)}
          </ul>
        )}
      </section>
    </div>
  )
}
