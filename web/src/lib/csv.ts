import type { Reading } from './api'
import { METRICS, METRIC_KEYS } from './metrics'

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** CSV số đo, có BOM để Excel mở đúng tiếng Việt */
export function readingsCsv(device: string, rows: Reading[]): string {
  const head = ['thiet_bi', 'thoi_gian', ...METRIC_KEYS.map(m => `${METRICS[m].label}${METRICS[m].unit ? ` (${METRICS[m].unit})` : ''}`)]
  const lines = rows.map(r => [device, new Date(r.ts * 1000).toISOString(), ...METRIC_KEYS.map(m => r[m]?.toString() ?? '')])
  return '﻿' + [head, ...lines].map(l => l.map(cell).join(',')).join('\r\n')
}

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
