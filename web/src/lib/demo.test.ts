import { describe, expect, it } from 'vitest'
import { DEMO_THRESHOLDS, appendEntry, detect, verifyLedger, type Entry } from './demo'

describe('demo backend', () => {
  it('detects threshold breaches and sensor faults like the server', () => {
    const found = detect([], { ph: 15.2, temp: 45, tds: 800 }, DEMO_THRESHOLDS)
    expect(found.map(f => [f.metric, f.kind])).toEqual([['ph', 'sensor'], ['temp', 'threshold']])
  })

  it('detects sudden spikes against recent history', () => {
    const hist = [100, 101, 99, 100, 102, 98].map(flow => ({ flow }))
    expect(detect(hist, { flow: 160 }, DEMO_THRESHOLDS)[0]).toMatchObject({ kind: 'spike' })
    expect(detect(hist, { flow: 101 }, DEMO_THRESHOLDS)).toEqual([])
  })

  it('hash chain catches an edited record', async () => {
    const ledger: Entry[] = []
    for (const body of ['a', 'b', 'c']) await appendEntry(ledger, { ts: 1, kind: 'reading', device: 'D', body })
    expect(await verifyLedger(ledger)).toEqual({ ok: true, checked: 3 })
    ledger[1].body = 'x'
    expect(await verifyLedger(ledger)).toMatchObject({ ok: false, broken_at: 2 })
  })
})
