import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMe, getUser, getUserPosts, updateAvatar, updateMe, withdraw } from './users'

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

  it('updateAvatar は PUT /api/users/me/avatar に、file の部品の FormData を送り、avatarUrl を返す', async () => {
    fetchMock.mockResolvedValueOnce(ok({ avatarUrl: 'https://example.com/a.png' }))
    const file = new File(['x'], 'icon.png', { type: 'image/png' })

    const result = await updateAvatar(file)

    expect(result).toEqual({ avatarUrl: 'https://example.com/a.png' })
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/users/me/avatar')
    expect(init.method).toBe('PUT')
    const form = init.body as FormData
    expect(form).toBeInstanceOf(FormData)
    expect(Array.from(form.keys())).toEqual(['file'])
    expect((form.get('file') as File).name).toBe('icon.png')
    expect(new Headers(init.headers).get('Content-Type')).toBeNull()
  })

  it('withdraw は DELETE /api/users/me に { password } の JSON を送り、204 なら何も返さない', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    const result = await withdraw('correct-horse-1')

    expect(result).toBeUndefined()
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/users/me')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBe('{"password":"correct-horse-1"}')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })
})
