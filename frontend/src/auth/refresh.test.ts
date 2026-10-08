import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const me = {
  id: '1',
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  bio: '',
  isFollowing: false,
  followersCount: 0,
  followingCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  isMe: true,
  email: 'alice@example.com',
}

function jsonResponse(status: number, body: unknown, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': contentType, 'X-Request-Id': 'req-1' },
  })
}

function unauthorized(): Response {
  return jsonResponse(
    401,
    { status: 401, code: 'INVALID_REFRESH_TOKEN', detail: '再ログインしてください', errors: [], requestId: 'req-1' },
    'application/problem+json',
  )
}

// 更新の Promise はモジュール変数で共有しているので、テストごとにモジュールを読み直して状態を持ち越さない。
async function load() {
  const refresh = await import('./refresh')
  const store = await import('./tokenStore')
  return { ...refresh, ...store }
}

describe('refreshSession', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('進行中の更新を共有する', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { accessToken: 'new', user: me }))
    const { refreshSession, getAccessToken } = await load()

    const [a, b] = await Promise.all([refreshSession(), refreshSession()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect(a?.accessToken).toBe('new')
    expect(getAccessToken()).toBe('new')
  })

  it('終わったあとの呼び出しは改めて更新する', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { accessToken: 'new', user: me }))
    const { refreshSession } = await load()

    await refreshSession()
    await refreshSession()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('401 でトークンを消して null を返す', async () => {
    fetchMock.mockImplementation(async () => unauthorized())
    const { refreshSession, getAccessToken, setAccessToken } = await load()
    setAccessToken('old')

    const result = await refreshSession()

    expect(result).toBeNull()
    expect(getAccessToken()).toBeNull()
  })

  it('401 以外の失敗は投げ直し、次の更新は走れる', async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse(500, { status: 500, code: 'INTERNAL_ERROR', detail: 'x', errors: [], requestId: 'r' }, 'application/problem+json'),
    )
    fetchMock.mockImplementationOnce(async () => jsonResponse(200, { accessToken: 'new', user: me }))
    const { refreshSession } = await load()

    await expect(refreshSession()).rejects.toMatchObject({ status: 500 })
    const result = await refreshSession()

    expect(result?.accessToken).toBe('new')
  })

  it('Web Locks があれば auth-refresh の鍵の中で更新する', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { accessToken: 'new', user: me }))
    const request = vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback())
    vi.stubGlobal('navigator', { ...navigator, locks: { request } })
    const { refreshSession } = await load()

    await refreshSession()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0]).toBe('auth-refresh')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
