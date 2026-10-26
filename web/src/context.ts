import { createContext, useContext } from 'react'
import type { AdminAction } from './hooks/useAdmin'
import type { PageId } from './hooks/usePage'

export type Notice = { id: number; tone: 'bad' | 'ok'; title: string; text?: string }

type Ctx = {
  /** Chạy thao tác cần khóa quản trị, tự hỏi khóa khi cần */
  runAdmin: (action: AdminAction) => Promise<boolean>
  notify: (n: Omit<Notice, 'id'>) => void
  /** Chuyển trang, có thể kèm thiết bị hoặc cảnh báo cần mở */
  open: (page: PageId, target?: { device?: string; alert?: number }) => void
  refresh: () => void
  theme: 'light' | 'dark'
}

export const AppContext = createContext<Ctx | null>(null)
export function useApp() {
  const c = useContext(AppContext)
  if (!c) throw new Error('useApp ngoài AppContext')
  return c
}

/** Chạy thao tác quản trị, báo kết quả bằng toast. Trả về true nếu thành công. */
export async function adminWithNotice(app: Ctx, action: AdminAction, done: string): Promise<boolean> {
  try {
    if (!(await app.runAdmin(action))) return false
    app.notify({ tone: 'ok', title: done })
    app.refresh()
    return true
  } catch (e) {
    app.notify({ tone: 'bad', title: 'Không thực hiện được', text: e instanceof Error ? e.message : String(e) })
    return false
  }
}
