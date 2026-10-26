import { useEffect, useState, type FormEvent } from 'react'
import { api, type Device, type MetricKey, type Thresholds } from '../lib/api'
import { CALIBRATION_DAYS, calibration, isOnline } from '../lib/kpi'
import { METRICS, METRIC_KEYS, ago } from '../lib/metrics'
import { parseDraft, toDraft, type ThresholdDraft } from '../lib/labels'
import { adminWithNotice, useApp } from '../context'
import { CalibrationChip, OnlineChip } from '../components/Chips'

const input = 'w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-ink'

type Props = { devices: Device[]; thresholds: Thresholds; now: number }

export function Devices({ devices, thresholds, now }: Props) {
  return (
    <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-[18px]">
        <DeviceTable devices={devices} now={now} />
        <AddDevice />
      </div>
      <ThresholdEditor thresholds={thresholds} />
    </div>
  )
}

function DeviceTable({ devices, now }: { devices: Device[]; now: number }) {
  const app = useApp()
  const [calibrating, setCalibrating] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const save = async (e: FormEvent, id: string) => {
    e.preventDefault()
    if (await adminWithNotice(app, key => api.calibrate(id, note.trim(), key), `Đã ghi nhận hiệu chuẩn ${id}`)) {
      setCalibrating(null)
      setNote('')
    }
  }

  return (
    <section className="panel animate-rise">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
        <h2 className="font-display text-base font-bold">Thiết bị đo</h2>
        <span className="text-xs text-muted">Hiệu chuẩn định kỳ {CALIBRATION_DAYS} ngày một lần</span>
      </div>
      {devices.length === 0 && <p className="px-4 py-6 text-muted">Chưa có thiết bị nào. Thêm thiết bị đầu tiên ở khung bên dưới.</p>}
      <ul className="grid gap-2 p-3">
        {devices.map(d => (
          <li key={d.id} className="rounded-[10px] border border-line bg-sunk p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <b className="font-semibold">{d.name || d.id}</b>
                <small className="block text-xs text-muted">{d.id} · {d.owner}</small>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <OnlineChip online={isOnline(d, now)} />
                <CalibrationChip state={calibration(d, now)} />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span>Số đo gần nhất: {d.last_ts ? ago(d.last_ts, now * 1000) : 'chưa có'}</span>
              <span>Hiệu chuẩn: {d.calibrated_ts ? new Date(d.calibrated_ts * 1000).toLocaleDateString('vi-VN') : 'chưa có'}</span>
              <span className="ml-auto flex gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => app.open('giam-sat', { device: d.id })}>Xem số đo</button>
                {calibrating !== d.id && <button type="button" className="btn" onClick={() => { setCalibrating(d.id); setNote('') }}>Ghi nhận hiệu chuẩn</button>}
              </span>
            </div>
            {calibrating === d.id && (
              <form onSubmit={e => save(e, d.id)} className="mt-3 grid gap-2 animate-rise">
                <label htmlFor={`cal-${d.id}`} className="eyebrow">Nội dung hiệu chuẩn</label>
                <input id={`cal-${d.id}`} autoFocus className={input} required maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="VD: pH chuẩn 4.01 / 7.00, TDS 1413 µS/cm, vệ sinh đầu đo" />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => setCalibrating(null)}>Hủy</button>
                  <button type="submit" className="btn">Lưu vào nhật ký</button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function AddDevice() {
  const app = useApp()
  const [form, setForm] = useState({ id: '', name: '', owner: '' })
  const [created, setCreated] = useState<{ id: string; key: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    let res: { id: string; key: string } | null = null
    const d = { id: form.id.trim(), name: form.name.trim(), owner: form.owner.trim() }
    if (await adminWithNotice(app, async key => { res = await api.addDevice(d, key) }, `Đã thêm thiết bị ${d.id}`)) {
      setCreated(res)
      setCopied(false)
      setForm({ id: '', name: '', owner: '' })
    }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(created!.key); setCopied(true) } catch { /* người dùng tự chọn và sao chép */ }
  }

  return (
    <section className="panel animate-rise" style={{ animationDelay: '.08s' }}>
      <h2 className="px-4 pt-4 font-display text-base font-bold">Thêm thiết bị</h2>
      <form onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-3">
        {([['id', 'Mã thiết bị', 'KCN-04'], ['name', 'Tên cơ sở', 'Nhà máy hóa chất D'], ['owner', 'Khu / cụm công nghiệp', 'KCN Quế Võ']] as const).map(([k, label, ph]) => (
          <div key={k}>
            <label htmlFor={`new-${k}`} className="eyebrow">{label}</label>
            <input
              id={`new-${k}`}
              className={`${input} mt-1`}
              required={k === 'id'}
              pattern={k === 'id' ? '[A-Za-z0-9_\\-]{2,32}' : undefined}
              title={k === 'id' ? '2–32 ký tự: chữ, số, gạch ngang, gạch dưới' : undefined}
              placeholder={ph}
              value={form[k]}
              onChange={e => setForm({ ...form, [k]: e.target.value })}
            />
          </div>
        ))}
        <div className="flex justify-end sm:col-span-3"><button type="submit" className="btn">Thêm và tạo khóa thiết bị</button></div>
      </form>
      {created && (
        <div className="mx-4 mb-4 rounded-xl border border-warn/50 bg-warn/10 p-3 animate-rise">
          <p className="font-semibold">Khóa của thiết bị {created.id}, chỉ hiện một lần</p>
          <p className="text-xs text-muted">Nạp vào biến DEVICE_KEY trong firmware ESP32. Server không hiển thị lại khóa này.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="num select-all break-all rounded-lg bg-surface px-2 py-1">{created.key}</code>
            <button type="button" className="btn btn-ghost" onClick={copy}>{copied ? 'Đã sao chép' : 'Sao chép'}</button>
          </div>
        </div>
      )}
    </section>
  )
}

const SOURCE: Record<MetricKey, string> = {
  ph: 'QCVN 40:2011/BTNMT cột B',
  temp: 'QCVN 40:2011/BTNMT cột B',
  tds: 'Tham khảo, QCVN 40 không quy định',
  turbidity: 'Tham khảo, QCVN 40 không quy định',
  flow: 'Theo giấy phép xả thải của cơ sở',
}

function ThresholdEditor({ thresholds }: { thresholds: Thresholds }) {
  const app = useApp()
  const [draft, setDraft] = useState<ThresholdDraft>(() => toDraft(thresholds))
  const [dirty, setDirty] = useState(false)
  // nhận ngưỡng mới từ server khi người dùng chưa sửa gì
  useEffect(() => { if (!dirty) setDraft(toDraft(thresholds)) }, [thresholds, dirty])

  const [parsed, error] = parseDraft(draft)
  const set = (m: MetricKey, i: 0 | 1, v: string) => {
    setDirty(true)
    setDraft(d => ({ ...d, [m]: (i === 0 ? [v, d[m][1]] : [d[m][0], v]) as [string, string] }))
  }
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (parsed && (await adminWithNotice(app, key => api.setThresholds(parsed, key), 'Đã lưu ngưỡng cảnh báo'))) setDirty(false)
  }

  return (
    <section className="panel content-start animate-rise" style={{ animationDelay: '.12s' }}>
      <div className="px-4 pt-4">
        <h2 className="font-display text-base font-bold">Ngưỡng cảnh báo</h2>
        <p className="text-xs text-muted">Để trống nếu không giới hạn. Mọi thay đổi được ghi vào nhật ký.</p>
      </div>
      <form onSubmit={save} className="grid gap-3 p-4">
        {METRIC_KEYS.map(m => (
          <fieldset key={m} className="grid grid-cols-[minmax(0,1fr)_88px_88px] items-end gap-2">
            <legend className="sr-only">{METRICS[m].label}</legend>
            <div className="min-w-0 pb-1.5">
              <b className="font-semibold">{METRICS[m].label}</b> <span className="text-xs text-muted">{METRICS[m].unit}</span>
              <small className="block truncate text-xs text-muted">{SOURCE[m]}</small>
            </div>
            {([0, 1] as const).map(i => (
              <div key={i}>
                <label htmlFor={`th-${m}-${i}`} className="text-[11px] text-muted">{i === 0 ? 'Thấp nhất' : 'Cao nhất'}</label>
                <input id={`th-${m}-${i}`} inputMode="decimal" className={`${input} num px-2 py-1.5`} value={draft[m][i]} onChange={e => set(m, i, e.target.value)} placeholder="—" />
              </div>
            ))}
          </fieldset>
        ))}
        <p className="min-h-[1.2em] text-[12.5px] text-bad" role="alert">{error}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" disabled={!dirty} onClick={() => { setDirty(false); setDraft(toDraft(thresholds)) }}>Hoàn tác</button>
          <button type="submit" className="btn" disabled={!dirty || !parsed}>Lưu ngưỡng</button>
        </div>
      </form>
    </section>
  )
}
