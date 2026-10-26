import type { Alert, Device } from '../lib/api'
import { calibration, isOnline, isOpen, kpis, risk } from '../lib/kpi'
import { ago, fmt } from '../lib/metrics'
import { useApp } from '../context'
import { AlertRow } from '../components/AlertRow'
import { CalibrationChip, OnlineChip, RiskChip } from '../components/Chips'

type Props = { devices: Device[]; alerts: Alert[]; now: number }

export function Overview({ devices, alerts, now }: Props) {
  const app = useApp()
  const k = kpis(devices, alerts, now)
  const ranked = devices.map(d => ({ d, r: risk(d, alerts, now) })).sort((a, b) => b.r.score - a.r.score)
  const open = alerts.filter(isOpen).slice(0, 5)

  const tiles = [
    { label: 'Thiết bị trực tuyến', value: `${k.online}/${k.total}`, note: 'gửi số đo trong 5 phút qua', bad: k.online < k.total },
    { label: 'Cảnh báo chưa xử lý', value: String(k.open), note: 'mới hoặc đang kiểm tra', bad: k.open > 0 },
    { label: 'Cảnh báo 24 giờ', value: String(k.last24), note: 'mọi loại, kể cả lỗi cảm biến' },
    { label: 'Tỷ lệ cảnh báo sai', value: k.falseRate == null ? '—' : `${Math.round(k.falseRate * 100)}%`, note: 'trên số cảnh báo đã đóng' },
    { label: 'Thời gian xử lý TB', value: k.mttrMin == null ? '—' : `${Math.round(k.mttrMin)} phút`, note: 'từ lúc cảnh báo đến lúc đóng' },
  ]

  return (
    <div className="grid gap-[18px]">
      {/* 5 ô: điện thoại 2+2+1 (ô cuối trải rộng), máy tính bảng 2+3, màn rộng 5 */}
      <section aria-label="Chỉ số thí điểm" className="grid grid-cols-2 gap-[18px] md:grid-cols-6 xl:grid-cols-5">
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className={`panel grid gap-1 px-4 py-3.5 animate-rise ${i < 2 ? 'md:col-span-3' : 'md:col-span-2'} ${i === 4 ? 'max-md:col-span-2' : ''} xl:col-span-1`}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <span className="eyebrow">{t.label}</span>
            <span className={`num font-display text-[30px] font-bold leading-tight tracking-tight ${t.bad ? 'text-bad' : ''}`}>{t.value}</span>
            <span className="text-xs text-muted">{t.note}</span>
          </div>
        ))}
      </section>

      <section className="panel animate-rise" style={{ animationDelay: '.15s' }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
          <h2 className="font-display text-base font-bold">Cơ sở cần ưu tiên kiểm tra</h2>
          <span className="text-xs text-muted">Xếp theo cảnh báo chưa xử lý, bất thường 24 giờ, mất tín hiệu, hạn hiệu chuẩn</span>
        </div>
        {devices.length === 0 ? (
          <p className="px-4 py-6 text-muted">Chưa có thiết bị nào. Thêm thiết bị ở trang Thiết bị &amp; ngưỡng.</p>
        ) : (
          <div className="relative overflow-x-auto px-2 pb-3 pt-2">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="eyebrow">
                <tr className="[&>th]:whitespace-nowrap [&>th]:px-2 [&>th]:py-2 [&>th]:font-semibold">
                  <th>Cơ sở</th><th>Kết nối</th><th className="text-right">pH</th><th className="text-right">Chưa xử lý</th><th>Hiệu chuẩn</th><th>Mức độ</th><th className="sr-only">Mở</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ d, r }) => (
                  <tr key={d.id} className="border-t border-line align-top [&>td]:px-2 [&>td]:py-2.5">
                    <td>
                      <b className="font-semibold">{d.name || d.id}</b>
                      <small className="block text-xs text-muted">{d.id} · {d.owner}</small>
                    </td>
                    <td>
                      <OnlineChip online={isOnline(d, now)} />
                      <small className="mt-1 block text-xs text-muted">{d.last_ts ? ago(d.last_ts, now * 1000) : 'chưa có số đo'}</small>
                    </td>
                    <td className="num text-right">{fmt('ph', d.last?.ph)}</td>
                    <td className={`num text-right font-semibold ${d.open_alerts ? 'text-bad' : 'text-muted'}`}>{d.open_alerts}</td>
                    <td><CalibrationChip state={calibration(d, now)} /></td>
                    <td>
                      <RiskChip level={r.level} />
                      {r.reasons.length > 0 && <small className="mt-1 block max-w-[240px] text-xs text-muted">{r.reasons.join(' · ')}</small>}
                    </td>
                    <td className="text-right">
                      <button type="button" className="btn btn-ghost" onClick={() => app.open('giam-sat', { device: d.id })}>Xem số đo</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel animate-rise" style={{ animationDelay: '.22s' }}>
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <h2 className="font-display text-base font-bold">Cảnh báo cần xử lý</h2>
          <button type="button" className="text-[13px] font-semibold text-accent hover:underline" onClick={() => app.open('canh-bao')}>Xem tất cả →</button>
        </div>
        {open.length === 0 ? (
          <p className="px-4 py-6 text-muted">Không có cảnh báo nào đang mở.</p>
        ) : (
          <ul className="grid gap-2 p-4 pt-3">
            {open.map(a => <AlertRow key={a.id} alert={a} now={now} onClick={() => app.open('canh-bao', { alert: a.id })} />)}
          </ul>
        )}
      </section>
    </div>
  )
}
