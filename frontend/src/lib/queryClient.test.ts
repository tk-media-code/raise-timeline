import { describe, expect, it } from 'vitest'
import { createQueryClient, queryClient } from './queryClient'

describe('queryClient', () => {
  it('既定でクエリを再試行せず、前面に戻っても取り直さない', () => {
    const queries = createQueryClient().getDefaultOptions().queries

    expect(queries?.retry).toBe(false)
    expect(queries?.refetchOnWindowFocus).toBe(false)
  })

  it('アプリで使う queryClient も同じ既定を持つ', () => {
    const queries = queryClient.getDefaultOptions().queries

    expect(queries?.retry).toBe(false)
    expect(queries?.refetchOnWindowFocus).toBe(false)
  })
})
