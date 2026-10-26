import { useCallback, useEffect, useState } from 'react'
import { api, type Alert, type Device, type Reading, type Thresholds } from '../lib/api'

type Snapshot = { devices: Device[]; device: string | null; readings: Reading[]; alerts: Alert[]; thresholds: Thresholds }
const EMPTY: Snapshot = { devices: [], device: null, readings: [], alerts: [], thresholds: {} }

/** Hỏi server định kỳ. `selected` null thì lấy thiết bị đầu tiên. */
export function useAquaData(selected: string | null, intervalMs = 3000) {
  const [snap, setSnap] = useState<Snapshot>(EMPTY)
  const [online, setOnline] = useState<boolean | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    let busy = false
    const load = async () => {
      if (busy) return
      busy = true
      try {
        const [devices, alerts, thresholds] = await Promise.all([api.devices(), api.alerts(), api.thresholds()])
        const device = selected && devices.some(d => d.id === selected) ? selected : devices[0]?.id ?? null
        const readings = device ? await api.readings(device) : []
        if (alive) {
          setSnap({ devices, device, readings, alerts, thresholds })
          setOnline(true)
        }
      } catch {
        if (alive) setOnline(false)
      } finally {
        busy = false
      }
    }
    load()
    const t = setInterval(load, intervalMs)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [selected, intervalMs, nonce])

  const refresh = useCallback(() => setNonce(n => n + 1), [])
  return { ...snap, online, refresh }
}
