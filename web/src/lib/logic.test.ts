import { describe, expect, it } from 'vitest'
import type { Alert, Device } from './api'
import { adviceFor } from './advice'
import { calibration, isOnline, kpis, risk } from './kpi'
import { readingsCsv } from './csv'
import { describeAudit, parseDraft, toDraft } from './labels'

const th = { ph: [5.5, 9] as [number, number], flow: [null, null] as [null, null] }
const NOW = 1_000_000
const dev = (o: Partial<Device> = {}): Device => ({ id: 'D', name: '', owner: '', calibrated_ts: NOW - 86400, last_ts: NOW - 10, last: {}, open_alerts: 0, ...o })
const alert = (o: Partial<Alert> = {}): Alert => ({ id: 1, ts: NOW - 60, device: 'D', metric: 'ph', value: 3, reason: '', kind: 'threshold', status: 'new', note: '', closed_ts: null, ...o })

describe('advice', () => {
  it('picks direction from thresholds', () => {
    expect(adviceFor({ kind: 'threshold', metric: 'ph', value: 3.8 }, th).title).toBe('Nước thải có tính axit')
    expect(adviceFor({ kind: 'threshold', metric: 'ph', value: 10.5 }, th).title).toBe('Nước thải có tính kiềm')
  })
  it('sensor faults never suggest pollution causes', () => {
    expect(adviceFor({ kind: 'sensor', metric: 'ph', value: 15 }, th).title).toContain('lỗi cảm biến')
  })
  it('spikes prepend a production-schedule check', () => {
    const a = adviceFor({ kind: 'spike', metric: 'ph', value: 8.6 }, th)
    expect(a.title).toContain('Biến động đột ngột')
    expect(a.steps[0]).toContain('lịch sản xuất')
  })
})

describe('kpi', () => {
  it('online and calibration states', () => {
    expect(isOnline(dev(), NOW)).toBe(true)
    expect(isOnline(dev({ last_ts: NOW - 600 }), NOW)).toBe(false)
    expect(isOnline(dev({ last_ts: null }), NOW)).toBe(false)
    expect(calibration(dev(), NOW)).toBe('ok')
    expect(calibration(dev({ calibrated_ts: NOW - 31 * 86400 }), NOW)).toBe('due')
    expect(calibration(dev({ calibrated_ts: null }), NOW)).toBe('never')
  })

  it('ranks risk: offline + open alerts is high, clean device is low', () => {
    expect(risk(dev(), [], NOW)).toMatchObject({ score: 0, level: 'low' })
    const r = risk(dev({ last_ts: NOW - 3600 }), [alert(), alert({ id: 2 })], NOW)
    expect(r.level).toBe('high')
    expect(r.reasons).toContain('mất tín hiệu')
    // cảnh báo sai không tính là bất thường
    expect(risk(dev(), [alert({ status: 'false_alarm', closed_ts: NOW })], NOW).score).toBe(0)
  })

  it('false-alarm rate and mean time to resolve', () => {
    const k = kpis([dev(), dev({ id: 'E', last_ts: null })], [
      alert({ status: 'resolved', ts: NOW - 600, closed_ts: NOW }),
      alert({ id: 2, status: 'false_alarm', ts: NOW - 1200, closed_ts: NOW }),
      alert({ id: 3 }),
    ], NOW)
    expect(k).toMatchObject({ online: 1, total: 2, open: 1, last24: 3, falseRate: 0.5, mttrMin: 15 })
    expect(kpis([], [], NOW).falseRate).toBeNull()
  })
})

describe('csv', () => {
  it('has BOM, header, and empty cells for missing metrics', () => {
    const csv = readingsCsv('KCN-01', [{ ts: 0, ph: 7.1 }])
    expect(csv.startsWith('﻿thiet_bi,thoi_gian,pH,')).toBe(true)
    expect(csv.split('\r\n')[1]).toBe('KCN-01,1970-01-01T00:00:00.000Z,7.1,,,,')
  })
})

describe('labels', () => {
  it('describes audit entries for people', () => {
    expect(describeAudit({ kind: 'threshold_change', body: '{"ph":[6,8.5],"temp":[null,40]}' })).toBe('pH 6 – 8.5; Nhiệt độ ≤ 40')
    expect(describeAudit({ kind: 'alert_update', body: '{"id":4,"status":"false_alarm","note":"đầu dò bẩn"}' })).toBe('#4 → Cảnh báo sai: đầu dò bẩn')
    expect(describeAudit({ kind: 'calibration', body: '{"note":""}' })).toBe('không ghi chú')
    expect(describeAudit({ kind: 'reading', body: 'not json' })).toBe('not json')
  })

  it('parses threshold inputs with comma decimals and rejects bad ranges', () => {
    const d = toDraft({ ph: [5.5, 9] })
    expect(d.ph).toEqual(['5.5', '9'])
    expect(d.flow).toEqual(['', ''])
    expect(parseDraft({ ...d, ph: ['6,5', ' 8 '] })[0]?.ph).toEqual([6.5, 8])
    expect(parseDraft({ ...d, ph: ['9', '5'] })[1]).toContain('ngưỡng dưới lớn hơn')
    expect(parseDraft({ ...d, tds: ['abc', ''] })[1]).toContain('phải là số')
  })
})
