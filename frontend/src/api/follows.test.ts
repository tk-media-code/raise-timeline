import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { followUser, getFollowers, getFollowing, unfollowUser } from './follows'

describe('フォローの API', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('followUser は PUT、unfollowUser は DELETE で /api/users/al%2Fice/follow を呼び、204 を受けて undefined を返す', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))

    await expect(followUser('al/ice')).resolves.toBeUndefined()
    await expect(unfollowUser('al/ice')).resolves.toBeUndefined()

    const [putPath, putInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(putPath).toBe('/api/users/al%2Fice/follow')
    expect(putInit.method).toBe('PUT')
    const [deletePath, deleteInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(deletePath).toBe('/api/users/al%2Fice/follow')
    expect(deleteInit.method).toBe('DELETE')
  })

  it('getFollowers・getFollowing は /followers・/following を呼び、cursor があれば ?cursor= を付ける', async () => {
    const page = { items: [], nextCursor: null }
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(page), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(getFollowers('alice', null)).resolves.toEqual(page)
    await getFollowers('alice', 'c/1')
    await expect(getFollowing('al/ice', null)).resolves.toEqual(page)
    await getFollowing('alice', 'c/1')

    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('/api/users/alice/followers')
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe('/api/users/alice/followers?cursor=c%2F1')
    expect((fetchMock.mock.calls[2] as [string])[0]).toBe('/api/users/al%2Fice/following')
    expect((fetchMock.mock.calls[3] as [string])[0]).toBe('/api/users/alice/following?cursor=c%2F1')
  })
})
