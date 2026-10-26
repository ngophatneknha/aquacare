import { describe, expect, it } from 'vitest'
import { DEMO_THRESHOLDS, appendEntry, detect, verifyLedger } from './demo'

describe('demo backend', () => {
  it('detects threshold breaches like the server', () => {
    const found = detect([], { ph: 3.8, temp: 45, tds: 800 }, DEMO_THRESHOLDS)
    expect(found.map(f => f.metric).sort()).toEqual(['ph', 'temp'])
  })

  it('detects sudden spikes against recent history', () => {
    const hist = [100, 101, 99, 100, 102, 98].map(flow => ({ flow }))
    expect(detect(hist, { flow: 160 }, DEMO_THRESHOLDS)[0].reason).toContain('đột ngột')
    expect(detect(hist, { flow: 101 }, DEMO_THRESHOLDS)).toEqual([])
  })

  it('hash chain catches an edited record', async () => {
    const ledger: Parameters<typeof appendEntry>[0] = []
    for (const b of ['a', 'b', 'c']) await appendEntry(ledger, b)
    expect(await verifyLedger(ledger)).toEqual({ ok: true, checked: 3 })
    ledger[1].body = 'x'
    expect(await verifyLedger(ledger)).toMatchObject({ ok: false, broken_at: 2 })
  })
})
