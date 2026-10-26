import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type Alert, type AlertKind, type AlertStatus, type Device, type Thresholds } from '../lib/api'
import { adviceFor } from '../lib/advice'
import { isOpen } from '../lib/kpi'
import { METRICS, fmt, isMetric } from '../lib/metrics'
import { adminWithNotice, useApp } from '../context'
import { AlertRow } from '../components/AlertRow'
import { KindChip, StatusChip } from '../components/Chips'
import { KIND_LABEL, STATUS_LABEL } from '../lib/labels'

type Filter = 'open' | AlertStatus | 'all'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'open', label: 'Đang mở' },
  { id: 'new', label: 'Mới' },
  { id: 'investigating', label: 'Đang kiểm tra' },
  { id: 'resolved', label: 'Đã xử lý' },
  { id: 'false_alarm', label: 'Cảnh báo sai' },
  { id: 'all', label: 'Tất cả' },
]

type Props = { alerts: Alert[]; devices: Device[]; thresholds: Thresholds; now: number; fresh: Set<number>; focus: number | null }

export function Alerts({ alerts, devices, thresholds, now, fresh, focus }: Props) {
  const [filter, setFilter] = useState<Filter>('open')
  const [device, setDevice] = useState('')
  const [kind, setKind] = useState<AlertKind | ''>('')
  const [selectedId, setSelectedId] = useState<number | null>(focus)
  const detailRef = useRef<HTMLDivElement>(null)

  // Mở từ trang khác với một cảnh báo cụ thể: hiện nó dù đang lọc gì
  useEffect(() => {
    if (focus == null) return
    setSelectedId(focus)
    setFilter('all')
  }, [focus])

  const shown = useMemo(() => alerts.filter(a =>
    (filter === 'all' || (filter === 'open' ? isOpen(a) : a.status === filter)) &&
    (!device || a.device === device) && (!kind || a.kind === kind)), [alerts, filter, device, kind])
  const selected = alerts.find(a => a.id === selectedId) ?? null

  const pick = (id: number) => {
    setSelectedId(id)
    // màn hình hẹp: chi tiết nằm dưới danh sách, cuộn tới để thấy
    if (matchMedia('(max-width: 1023px)').matches) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const select = 'rounded-[10px] border border-line bg-surface px-3 py-1.5 text-[13px] text-ink'
  return (
    <div className="grid gap-[18px]">
      <section className="panel flex flex-wrap items-center gap-3 p-3 animate-rise" aria-label="Lọc cảnh báo">
        <div role="group" aria-label="Trạng thái" className="flex flex-wrap gap-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1 text-[13px] font-medium transition ${filter === f.id ? 'bg-accent text-surface' : 'text-muted hover:bg-sunk hover:text-ink'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="f-device">Thiết bị</label>
        <select id="f-device" className={select} value={device} onChange={e => setDevice(e.target.value)}>
          <option value="">Mọi thiết bị</option>
          {devices.map(d => <option key={d.id} value={d.id}>{d.id} · {d.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-kind">Loại</label>
        <select id="f-kind" className={select} value={kind} onChange={e => setKind(e.target.value as AlertKind | '')}>
          <option value="">Mọi loại</option>
          {(Object.keys(KIND_LABEL) as AlertKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <span className="eyebrow ml-auto">{shown.length} cảnh báo</span>
      </section>

      <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="panel animate-rise" style={{ animationDelay: '.08s' }} aria-label="Danh sách cảnh báo">
          {shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted">Không có cảnh báo nào khớp bộ lọc.</p>
          ) : (
            <ul className="grid max-h-[70vh] gap-2 overflow-y-auto p-3">
              {shown.map(a => <AlertRow key={a.id} alert={a} now={now} selected={a.id === selectedId} fresh={fresh.has(a.id)} onClick={() => pick(a.id)} />)}
            </ul>
          )}
        </section>
        <div ref={detailRef} className="scroll-mt-24 lg:sticky lg:top-36">
          {selected ? <AlertDetail key={selected.id} alert={selected} device={devices.find(d => d.id === selected.device)} thresholds={thresholds} /> : (
            <section className="panel grid place-items-center px-6 py-14 text-center text-muted animate-rise" style={{ animationDelay: '.15s' }}>
              Chọn một cảnh báo để xem gợi ý kiểm tra và cập nhật trạng thái xử lý.
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function AlertDetail({ alert: a, device, thresholds }: { alert: Alert; device?: Device; thresholds: Thresholds }) {
  const app = useApp()
  const [note, setNote] = useState(a.note)
  const [busy, setBusy] = useState(false)
  const advice = adviceFor(a, thresholds)
  const meta = isMetric(a.metric) ? METRICS[a.metric] : null
  const open = isOpen(a)

  const change = async (status: AlertStatus) => {
    setBusy(true)
    await adminWithNotice(app, key => api.updateAlert(a.id, status, note.trim(), key), `Cảnh báo #${a.id}: ${STATUS_LABEL[status].toLowerCase()}`)
    setBusy(false)
  }

  const actions: { status: AlertStatus; label: string; ghost?: boolean }[] = open
    ? [
        ...(a.status === 'new' ? [{ status: 'investigating' as const, label: 'Bắt đầu kiểm tra' }] : []),
        { status: 'resolved', label: 'Đã xử lý xong', ghost: a.status === 'new' },
        { status: 'false_alarm', label: 'Đánh dấu cảnh báo sai', ghost: true },
      ]
    : [{ status: 'investigating', label: 'Mở lại để kiểm tra', ghost: true }]

  return (
    <section className="panel grid gap-4 p-5 animate-rise" aria-label={`Chi tiết cảnh báo ${a.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="eyebrow">Cảnh báo #{a.id} · {a.device}{device ? ` · ${device.name}` : ''}</span>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
            {meta?.label ?? a.metric} <span className={`num ${a.kind === 'sensor' ? 'text-accent' : 'text-bad'}`}>{fmt(a.metric, a.value)}</span>
            <span className="ml-1 font-body text-sm font-medium text-muted">{meta?.unit}</span>
          </h2>
          <p className="text-muted">{a.reason} · {new Date(a.ts * 1000).toLocaleString('vi-VN')}</p>
        </div>
        <div className="flex flex-wrap gap-1.5"><KindChip kind={a.kind} /><StatusChip status={a.status} /></div>
      </div>

      <div className="rounded-xl border border-line bg-sunk p-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z" /></svg>
          Gợi ý kiểm tra: {advice.title}
        </h3>
        <ol className="mt-2 grid list-decimal gap-1 pl-5 text-[13.5px]">
          {advice.steps.map(s => <li key={s}>{s}</li>)}
        </ol>
        <p className="mt-2 text-xs text-muted">Gợi ý theo kinh nghiệm vận hành. Kỹ sư tại cơ sở quyết định biện pháp xử lý.</p>
      </div>

      <div>
        <label htmlFor="alert-note" className="eyebrow">Ghi chú xử lý</label>
        <textarea
          id="alert-note"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Nguyên nhân, biện pháp đã làm, kết quả mẫu đối chứng…"
          className="mt-1 w-full resize-y rounded-[10px] border border-line bg-surface px-3 py-2 text-ink"
        />
        {a.closed_ts && (
          <p className="mt-1 text-xs text-muted">Đóng lúc {new Date(a.closed_ts * 1000).toLocaleString('vi-VN')}, sau {Math.max(1, Math.round((a.closed_ts - a.ts) / 60))} phút.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {actions.map(x => (
          <button key={x.status} type="button" disabled={busy} className={`btn ${x.ghost ? 'btn-ghost' : ''}`} onClick={() => change(x.status)}>{x.label}</button>
        ))}
        {note.trim() !== a.note && (
          <button type="button" disabled={busy} className="btn btn-ghost" onClick={() => change(a.status)}>Lưu ghi chú</button>
        )}
      </div>
    </section>
  )
}
