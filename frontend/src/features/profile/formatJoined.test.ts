import { describe, expect, it } from 'vitest'
import { formatJoined } from './formatJoined'

describe('formatJoined', () => {
  it.each([
    ['2026-09-30T15:00:00Z', '2026年10月に登録'],
    ['2026-09-30T14:59:59Z', '2026年9月に登録'],
    ['2025-12-31T15:00:00Z', '2026年1月に登録'],
  ])('%s は日本時間の年月で「%s」になる', (iso, expected) => {
    expect(formatJoined(iso)).toBe(expected)
  })
})
