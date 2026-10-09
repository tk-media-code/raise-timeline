import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMe, getUser, getUserPosts, updateMe } from './users'

const user = {
  id: 'u1',
  username: 'alice',
  displayName: 'アリス',
  avatarUrl: null,
  bio: 'こんにちは',
  isFollowing: false,
  followersCount: 0,
  followingCount: 0,
  createdAt: '2026-10-09T07:36:14Z',
  isMe: false,
}
const me = { ...user, isMe: true, email: 'alice@example.com' }

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('プロフィールの API', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('getUser は GET /api/users/{username} を呼ぶ', async () => {
    fetchMock.mockResolvedValueOnce(ok(user))

    const result = await getUser('alice')

    expect(result).toEqual(user)
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/users/alice')
    expect(init.method ?? 'GET').toBe('GET')
  })

  it('getUser はユーザー名を encodeURIComponent する', async () => {
    fetchMock.mockResolvedValueOnce(ok(user))

    await getUser('a/b')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/users/a%2Fb')
  })

  it("getUserPosts(username, null) は cursor を付けない。'c1' なら ?cursor=c1 を付ける", async () => {
    fetchMock.mockImplementation(async () => ok({ items: [], nextCursor: null }))

    await getUserPosts('alice', null)
    await getUserPosts('alice', 'c1')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/users/alice/posts')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/users/alice/posts?cursor=c1')
  })

  it('getUserPosts はユーザー名と cursor を URL エンコードする', async () => {
    fetchMock.mockResolvedValueOnce(ok({ items: [], nextCursor: null }))

    await getUserPosts('a/b', 'a&b=c')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/users/a%2Fb/posts?cursor=a%26b%3Dc')
  })

  it('getMe は GET /api/users/me を呼ぶ', async () => {
    fetchMock.mockResolvedValueOnce(ok(me))

    const result = await getMe()

    expect(result.email).toBe('alice@example.com')
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/users/me')
    expect(init.method ?? 'GET').toBe('GET')
  })

  it('updateMe は PATCH /api/users/me に { displayName, bio } の JSON を送る', async () => {
    fetchMock.mockResolvedValueOnce(ok({ ...me, displayName: '新しい名前', bio: '直した' }))

    const result = await updateMe({ displayName: '新しい名前', bio: '直した' })

    expect(result.displayName).toBe('新しい名前')
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/users/me')
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe('{"displayName":"新しい名前","bio":"直した"}')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })
})
