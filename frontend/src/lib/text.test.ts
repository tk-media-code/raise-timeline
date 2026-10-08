import { describe, expect, it } from 'vitest'
import { countCodePoints } from './text'

describe('countCodePoints', () => {
  it('サロゲートペアの絵文字を 1 文字と数える', () => {
    expect(countCodePoints('😀')).toBe(1)
  })

  it('日本語は 1 文字ずつ数える', () => {
    expect(countCodePoints('あいう')).toBe(3)
  })

  it('空文字は 0', () => {
    expect(countCodePoints('')).toBe(0)
  })
})
