import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { likePost, unlikePost } from './likes'

describe('いいねの API', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('likePost は PUT、unlikePost は DELETE で /api/posts/p%2F1/like を呼び、204 を受けて undefined を返す', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))

    await expect(likePost('p/1')).resolves.toBeUndefined()
    await expect(unlikePost('p/1')).resolves.toBeUndefined()

    const [putPath, putInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(putPath).toBe('/api/posts/p%2F1/like')
    expect(putInit.method).toBe('PUT')
    const [deletePath, deleteInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(deletePath).toBe('/api/posts/p%2F1/like')
    expect(deleteInit.method).toBe('DELETE')
  })
})
