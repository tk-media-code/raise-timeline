import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/client'
import { followFailureMessage } from './followFailureMessage'

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

describe('followFailureMessage', () => {
  it('フォローするとき（following が true）の 500 は、requestId を末尾に付ける', () => {
    expect(followFailureMessage(apiError({ status: 500, requestId: 'r1' }), true)).toBe(
      'フォローに失敗しました。もう一度お試しください（ID: r1）',
    )
  })

  it('解除するとき（following が false）の通信の失敗（ApiError でない）は、ID なしの解除の文言', () => {
    expect(followFailureMessage(new TypeError('Failed to fetch'), false)).toBe(
      'フォローの解除に失敗しました。もう一度お試しください',
    )
  })

  it('500 でも requestId が無ければ、ID を付けない', () => {
    expect(followFailureMessage(apiError({ status: 500, requestId: null }), true)).toBe(
      'フォローに失敗しました。もう一度お試しください',
    )
  })

  it('400 は requestId があっても ID を付けない', () => {
    expect(followFailureMessage(apiError({ status: 400, requestId: 'r1' }), false)).toBe(
      'フォローの解除に失敗しました。もう一度お試しください',
    )
  })
})
