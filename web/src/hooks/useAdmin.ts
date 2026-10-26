import { useCallback, useState } from 'react'
import { AuthError } from '../lib/api'

export type AdminAction = (key: string) => Promise<unknown>
const STORE = 'aquacare-admin-key'

const readKey = () => { try { return sessionStorage.getItem(STORE) } catch { return null } }
const saveKey = (k: string | null) => {
  try { if (k) sessionStorage.setItem(STORE, k); else sessionStorage.removeItem(STORE) } catch { /* trình duyệt chặn lưu trữ */ }
}

/**
 * Chạy một thao tác cần khóa quản trị. Có khóa đã nhớ trong phiên thì dùng luôn,
 * sai hoặc chưa có thì mở hộp thoại hỏi khóa. Trả về true nếu thao tác chạy xong.
 * Lỗi khác lỗi khóa (dữ liệu không hợp lệ, mất mạng) được ném ra cho nơi gọi.
 */
export function useAdmin() {
  const [pending, setPending] = useState<{ action: AdminAction; resolve: (ok: boolean) => void } | null>(null)

  const run = useCallback(async (action: AdminAction): Promise<boolean> => {
    const saved = readKey()
    if (saved) {
      try {
        await action(saved)
        return true
      } catch (e) {
        if (!(e instanceof AuthError)) throw e
        saveKey(null)
      }
    }
    return new Promise<boolean>(resolve => setPending({ action, resolve }))
  }, [])

  /** Gọi từ hộp thoại. Trả về thông báo lỗi để hiện, hoặc null nếu thành công. */
  const submit = useCallback(async (key: string): Promise<string | null> => {
    if (!pending) return null
    try {
      await pending.action(key)
    } catch (e) {
      if (e instanceof AuthError) return 'Khóa không đúng. Kiểm tra biến AQUACARE_ADMIN_KEY trên server.'
      return e instanceof Error ? e.message : 'Không gửi được tới server. Kiểm tra kết nối rồi thử lại.'
    }
    saveKey(key)
    pending.resolve(true)
    setPending(null)
    return null
  }, [pending])

  const cancel = useCallback(() => {
    pending?.resolve(false)
    setPending(null)
  }, [pending])

  return { run, asking: pending !== null, submit, cancel }
}
