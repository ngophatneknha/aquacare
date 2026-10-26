import { describe, expect, it } from 'vitest'
import { ago, fmt, isOut, pct, rangeLabel } from './metrics'

const th = { ph: [5.5, 9] as [number, number], temp: [null, 40] as [null, number] }

describe('metrics', () => {
  it('flags values outside thresholds only', () => {
    expect(isOut(th, 'ph', 7)).toBe(false)
    expect(isOut(th, 'ph', 5.5)).toBe(false)
    expect(isOut(th, 'ph', 3.8)).toBe(true)
    expect(isOut(th, 'ph', 10.5)).toBe(true)
    expect(isOut(th, 'temp', 45)).toBe(true)
    expect(isOut(th, 'flow', 9999)).toBe(false) // không có ngưỡng
    expect(isOut(th, 'ph', null)).toBe(false)
  })

  it('formats per metric precision', () => {
    expect(fmt('tds', 812.6)).toBe('813')
    expect(fmt('ph', 7)).toBe('7.00')
    expect(fmt('unknown', 1)).toBe('1.00')
    expect(fmt('ph', undefined)).toBe('—')
  })

  it('labels ranges', () => {
    expect(rangeLabel(5.5, 9)).toBe('5.5 – 9')
    expect(rangeLabel(null, 40)).toBe('≤ 40')
    expect(rangeLabel(null, null)).toBe('không giới hạn')
  })

  it('clamps scale position', () => {
    expect(pct('ph', 7)).toBe(50)
    expect(pct('ph', -3)).toBe(0)
    expect(pct('ph', 20)).toBe(100)
  })

  it('describes time ago', () => {
    expect(ago(100, 105_000)).toBe('5 giây trước')
    expect(ago(100, 400_000)).toBe('5 phút trước')
  })
})
