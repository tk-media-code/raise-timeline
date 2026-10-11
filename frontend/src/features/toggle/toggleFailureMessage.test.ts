import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/client'
import { toggleFailureMessage } from './toggleFailureMessage'

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

describe('toggleFailureMessage', () => {
  it('500 で requestId があれば、末尾に（ID: r1）を添える', () => {
    expect(toggleFailureMessage(apiError({ status: 500, requestId: 'r1' }), '失敗しました')).toBe('失敗しました（ID: r1）')
  })

  it('500 でも requestId が無ければ、base のまま', () => {
    expect(toggleFailureMessage(apiError({ status: 500, requestId: null }), '失敗しました')).toBe('失敗しました')
  })

  it('400 は requestId があっても、base のまま', () => {
    expect(toggleFailureMessage(apiError({ status: 400, requestId: 'r1' }), '失敗しました')).toBe('失敗しました')
  })

  it('ApiError でない失敗は、base のまま', () => {
    expect(toggleFailureMessage(new TypeError('Failed to fetch'), '失敗しました')).toBe('失敗しました')
  })
})
