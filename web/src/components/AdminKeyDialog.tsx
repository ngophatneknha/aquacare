import { useEffect, useRef, useState, type FormEvent } from 'react'

type Props = { open: boolean; onSubmit: (key: string) => Promise<boolean>; onClose: () => void }

/** Hỏi khóa quản trị trước khi xác nhận cảnh báo. onSubmit trả false nếu sai khóa. */
export function AdminKeyDialog({ open, onSubmit, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const d = ref.current!
    if (open && !d.open) {
      setKey('')
      setError('')
      d.showModal()
    } else if (!open && d.open) d.close()
  }, [open])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (!(await onSubmit(key))) setError('Khóa không đúng. Kiểm tra biến AQUACARE_ADMIN_KEY trên server.')
    } catch {
      setError('Không gửi được tới server. Kiểm tra kết nối rồi thử lại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="w-[min(380px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-5 text-ink shadow-card open:animate-rise"
    >
      <form onSubmit={submit}>
        <h4 className="mb-1.5 font-display text-[17px] font-bold">Xác nhận đã xử lý cảnh báo</h4>
        <p className="mb-3.5 text-muted">Thao tác này được ghi vào nhật ký chống sửa. Nhập khóa quản trị để tiếp tục.</p>
        <label htmlFor="admin-key" className="eyebrow">Khóa quản trị</label>
        <input
          id="admin-key"
          type="password"
          autoComplete="off"
          required
          autoFocus
          value={key}
          onChange={e => setKey(e.target.value)}
          className="num mt-1 w-full rounded-[10px] border border-line bg-sunk px-3 py-2.5 text-ink"
        />
        <p className="mt-2 min-h-[1.2em] text-[12.5px] text-bad" role="alert">{error}</p>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Hủy</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Đang gửi…' : 'Xác nhận'}</button>
        </div>
      </form>
    </dialog>
  )
}
