import { describe, expect, it } from 'vitest'
import { BIO_MAX, bioRemaining } from './validation'

describe('bioRemaining', () => {
  it('上限は 160 文字', () => {
    expect(BIO_MAX).toBe(160)
    expect(bioRemaining('')).toBe(160)
  })

  it('絵文字と改行をコードポイントで 1 文字ずつ数える', () => {
    expect(bioRemaining('😀\n')).toBe(158)
  })

  it('ちょうど 160 文字なら 0、超えると負になる', () => {
    expect(bioRemaining('😀'.repeat(160))).toBe(0)
    expect(bioRemaining('😀'.repeat(161))).toBe(-1)
  })

  it('CRLF は LF と同じ 1 文字に数える（サーバーは LF に直してから数える）', () => {
    expect(bioRemaining('あ\r\nい')).toBe(157)
  })
})
