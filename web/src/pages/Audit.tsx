import { useCallback, useEffect, useState } from 'react'
import { api, type AuditEntry, type ChainStatus } from '../lib/api'
import { ACTION_LABEL, describeAudit } from '../lib/labels'

export function Audit() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null)
  const [kind, setKind] = useState('')
  const [chain, setChain] = useState<ChainStatus | 'busy' | 'error'>('busy')

  useEffect(() => {
    let alive = true
    const load = () => api.audit().then(r => alive && setRows(r)).catch(() => alive && setRows(r => r ?? []))
    load()
    const t = setInterval(load, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const check = useCallback(async () => {
    setChain('busy')
    try { setChain(await api.verify()) } catch { setChain('error') }
  }, [])
  useEffect(() => { check() }, [check])

  const shown = (rows ?? []).filter(r => !kind || r.kind === kind)
  const ok = typeof chain === 'object' && chain.ok
  return (
    <div className="grid gap-[18px] lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className={`panel content-start p-5 animate-rise ${typeof chain === 'object' && !chain.ok ? 'border-bad' : ''}`}>
        <span className="eyebrow">Toàn vẹn dữ liệu</span>
        <p className={`mt-1 font-display text-2xl font-bold ${chain === 'busy' ? '' : ok ? 'text-ok' : 'text-bad'}`}>
          {chain === 'busy' ? 'Đang kiểm tra…' : chain === 'error' ? 'Không kiểm tra được' : chain.ok ? 'Không bị sửa' : `Bị sửa tại #${chain.broken_at}`}
        </p>
        {typeof chain === 'object' && <p className="num text-xs text-muted">{chain.checked.toLocaleString('vi-VN')} bản ghi đã kiểm tra</p>}
        <p className="mt-3 text-[13px] text-muted">
          Mỗi số đo và thao tác được nối với bản ghi trước bằng mã băm SHA-256. Sửa hay xóa một bản ghi cũ làm đứt chuỗi tại đúng vị trí đó.
        </p>
        <button type="button" className="btn mt-4" onClick={check} disabled={chain === 'busy'}>Kiểm tra lại toàn bộ</button>
      </section>

      <section className="panel animate-rise" style={{ animationDelay: '.08s' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
          <h2 className="font-display text-base font-bold">Nhật ký thao tác</h2>
          <label className="sr-only" htmlFor="audit-kind">Loại thao tác</label>
          <select id="audit-kind" value={kind} onChange={e => setKind(e.target.value)} className="rounded-[10px] border border-line bg-surface px-3 py-1.5 text-[13px] text-ink">
            <option value="">Mọi thao tác</option>
            {Object.entries(ACTION_LABEL).filter(([k]) => k !== 'alert_ack').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {rows === null ? <p className="px-4 py-6 text-muted">Đang tải…</p> : shown.length === 0 ? <p className="px-4 py-6 text-muted">Chưa có thao tác nào.</p> : (
          <div className="relative overflow-x-auto px-2 pb-3 pt-2">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="eyebrow">
                <tr className="[&>th]:whitespace-nowrap [&>th]:px-2 [&>th]:py-2 [&>th]:font-semibold"><th>#</th><th>Thời gian</th><th>Thao tác</th><th>Thiết bị</th><th>Nội dung</th><th>Mã băm</th></tr>
              </thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.seq} className="border-t border-line align-top [&>td]:px-2 [&>td]:py-2">
                    <td className="num text-muted">{r.seq}</td>
                    <td className="num whitespace-nowrap">{new Date(r.ts * 1000).toLocaleString('vi-VN')}</td>
                    <td className="whitespace-nowrap font-semibold">{ACTION_LABEL[r.kind] ?? r.kind}</td>
                    <td className="num whitespace-nowrap">{r.device ?? "—"}</td>
                    <td className="max-w-[360px]">{describeAudit(r)}</td>
                    <td className="num text-muted" title={r.hash}>{r.hash.slice(0, 10)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
