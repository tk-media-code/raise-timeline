import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/client'
import { likeFailureMessage } from './likeFailureMessage'

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

describe('likeFailureMessage', () => {
  it('付けるとき（liked が true）の 500 は、requestId を末尾に付ける', () => {
    expect(likeFailureMessage(apiError({ status: 500, requestId: 'r1' }), true)).toBe(
      'いいねに失敗しました。もう一度お試しください（ID: r1）',
    )
  })

  it('外すとき（liked が false）の通信の失敗（ApiError でない）は、ID なしの取り消しの文言', () => {
    expect(likeFailureMessage(new TypeError('Failed to fetch'), false)).toBe(
      'いいねの取り消しに失敗しました。もう一度お試しください',
    )
  })

  it('500 でも requestId が無ければ、ID を付けない', () => {
    expect(likeFailureMessage(apiError({ status: 500, requestId: null }), true)).toBe(
      'いいねに失敗しました。もう一度お試しください',
    )
  })

  it('400 は requestId があっても ID を付けない', () => {
    expect(likeFailureMessage(apiError({ status: 400, requestId: 'r1' }), false)).toBe(
      'いいねの取り消しに失敗しました。もう一度お試しください',
    )
  })
})
