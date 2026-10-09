import { describe, expect, it } from 'vitest'
import { canSubmitBody, POST_BODY_MAX, remainingChars } from './validation'

describe('投稿の本文の検査', () => {
  it('上限は 280 文字', () => {
    expect(POST_BODY_MAX).toBe(280)
  })

  it('「あ」280 文字は、残り 0 で送れる', () => {
    const body = 'あ'.repeat(280)

    expect(remainingChars(body)).toBe(0)
    expect(canSubmitBody(body)).toBe(true)
  })

  it('「あ」281 文字は、残り -1 で送れない', () => {
    const body = 'あ'.repeat(281)

    expect(remainingChars(body)).toBe(-1)
    expect(canSubmitBody(body)).toBe(false)
  })

  it('空と、空白・改行・全角空白だけは送れない', () => {
    expect(canSubmitBody('')).toBe(false)
    expect(canSubmitBody(' \n　 ')).toBe(false)
  })

  it('絵文字 280 個は、1 個を 1 文字と数えて送れる', () => {
    const body = '😀'.repeat(280)

    expect(remainingChars(body)).toBe(0)
    expect(canSubmitBody(body)).toBe(true)
  })
})
