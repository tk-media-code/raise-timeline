import { describe, expect, it } from 'vitest'
import { formatAbsoluteTime, formatRelativeTime } from './formatTime'

// 日本時間 2026-10-06 14:12
const NOW = new Date('2026-10-06T05:12:00Z')

describe('formatRelativeTime', () => {
  it.each([
    ['2026-10-06T05:11:30Z', 'たった今'],
    ['2026-10-06T05:12:30Z', 'たった今'], // 30 秒の未来（サーバーと端末の時計のずれ）
    ['2026-10-06T05:20:00Z', 'たった今'], // 8 分の未来でも負の分数にしない
    ['2026-10-06T05:09:00Z', '3 分前'],
    ['2026-10-06T04:12:01Z', '59 分前'],
    ['2026-10-06T04:12:00Z', '1 時間前'],
    ['2026-10-05T05:12:01Z', '23 時間前'],
    ['2026-10-05T05:12:00Z', '10月5日'],
    ['2025-12-31T15:00:00Z', '1月1日'], // 日本時間で 2026-01-01 0:00（UTC のままなら前年になる）
    ['2025-12-31T14:59:00Z', '2025年12月31日'], // 日本時間で 2025-12-31 23:59
  ])('%s は「%s」', (createdAt, expected) => {
    expect(formatRelativeTime(createdAt, NOW)).toBe(expected)
  })

  it('年の境目は日本時間で見る。now が日本時間で 2026-01-01 0:30 なら、前年の日付には年を付ける', () => {
    const newYear = new Date('2025-12-31T15:30:00Z')

    expect(formatRelativeTime('2025-12-30T10:00:00Z', newYear)).toBe('2025年12月30日')
  })
})

describe('formatAbsoluteTime', () => {
  it.each([
    ['2026-10-06T05:12:34Z', '2026/10/06 14:12'],
    ['2025-12-31T15:00:00Z', '2026/01/01 00:00'], // 24:00 と出さない
  ])('%s は「%s」', (createdAt, expected) => {
    expect(formatAbsoluteTime(createdAt)).toBe(expected)
  })
})
