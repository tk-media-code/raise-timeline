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

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function problem(status: number, code: string, extra: Record<string, unknown> = {}, requestId = 'req-1'): Response {
  return new Response(
    JSON.stringify({ status, title: 't', detail: '詳細', instance: '/x', code, errors: [], requestId, ...extra }),
    { status, headers: { 'Content-Type': 'application/problem+json', 'X-Request-Id': requestId } },
  )
}

// 更新の Promise とトークンはモジュール変数なので、テストごとに読み直して持ち越さない。
async function load() {
  const client = await import('./client')
  const auth = await import('./auth')
  const store = await import('../auth/tokenStore')
  return { ...client, ...auth, ...store }
}

function authorizationOf(call: unknown[]): string | null {
  const init = call[1] as RequestInit
  return new Headers(init.headers).get('Authorization')
}

describe('apiFetch', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Bearer を付ける', async () => {
    fetchMock.mockResolvedValueOnce(ok(me))
    const { apiFetch, setAccessToken } = await load()
    setAccessToken('t')

    await apiFetch('/api/users/me')

    expect(authorizationOf(fetchMock.mock.calls[0])).toBe('Bearer t')
  })

  it('body は JSON にして Content-Type と same-origin の Cookie 設定を付ける', async () => {
    fetchMock.mockResolvedValueOnce(ok({}))
    const { apiFetch } = await load()

    await apiFetch('/api/x', { method: 'POST', body: { a: 1 } })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.body).toBe('{"a":1}')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(init.credentials).toBe('same-origin')
  })

  it('204 は undefined を返す', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { apiFetch } = await load()

    await expect(apiFetch('/api/x', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('問題応答を ApiError に変換する', async () => {
    fetchMock.mockResolvedValueOnce(
      problem(422, 'VALIDATION_FAILED', { errors: [{ field: 'email', message: '形式が正しくありません' }] }, 'abc123'),
    )
    const { apiFetch, ApiError } = await load()

    const error = await apiFetch('/api/x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
      detail: '詳細',
      errors: [{ field: 'email', message: '形式が正しくありません' }],
      requestId: 'abc123',
    })
  })

  it('500 の文言に requestId を全桁添える', async () => {
    const { ApiError, formatErrorMessage } = await load()
    const id = '0123456789abcdef0123456789abcdef'
    const detail = '問題が起きました。時間をおいて再試行してください'

    const error500 = new ApiError({ status: 500, code: 'INTERNAL_ERROR', detail, errors: [], requestId: id })
    const error422 = new ApiError({ status: 422, code: 'VALIDATION_FAILED', detail: '入力を確認してください', errors: [], requestId: id })
    const noId = new ApiError({ status: 500, code: null, detail: '通信に失敗しました', errors: [], requestId: null })

    expect(formatErrorMessage(error500)).toBe(`${detail}（ID: ${id}）`)
    expect(formatErrorMessage(error422)).toBe('入力を確認してください')
    expect(formatErrorMessage(noId)).toBe('通信に失敗しました')
  })

  it('401 UNAUTHENTICATED なら更新して 1 回だけやり直す', async () => {
    fetchMock
      .mockResolvedValueOnce(problem(401, 'UNAUTHENTICATED'))
      .mockResolvedValueOnce(ok({ accessToken: 'new', user: me }))
      .mockResolvedValueOnce(ok(me))
    const { apiFetch, setAccessToken } = await load()
    setAccessToken('old')

    const result = await apiFetch('/api/users/me')

    expect(result).toEqual(me)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh')
    expect(authorizationOf(fetchMock.mock.calls[0])).toBe('Bearer old')
    expect(authorizationOf(fetchMock.mock.calls[2])).toBe('Bearer new')
  })

  it('更新も失敗したら ApiError を投げる', async () => {
    fetchMock
      .mockResolvedValueOnce(problem(401, 'UNAUTHENTICATED'))
      .mockResolvedValueOnce(problem(401, 'INVALID_REFRESH_TOKEN'))
    const { apiFetch, ApiError, setAccessToken } = await load()
    setAccessToken('old')

    const error = await apiFetch('/api/users/me').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('更新で別の利用者が返ったら、元の要求をやり直さずに 401 を投げる', async () => {
    fetchMock
      .mockResolvedValueOnce(problem(401, 'UNAUTHENTICATED'))
      .mockResolvedValueOnce(ok({ accessToken: 'other', user: { ...me, id: '2' } }))
    const { apiFetch, ApiError, setAccessToken, setSessionUserId, getAccessToken } = await load()
    setAccessToken('old')
    setSessionUserId('1')

    const error = await apiFetch('/api/users/me').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    // 元の要求と更新だけ。3 回目（別の利用者のトークンでのやり直し）は無い。
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getAccessToken()).toBeNull()
  })

  it('やり直しでも 401 なら ApiError を投げ、更新は繰り返さない', async () => {
    fetchMock
      .mockResolvedValueOnce(problem(401, 'UNAUTHENTICATED'))
      .mockResolvedValueOnce(ok({ accessToken: 'new', user: me }))
      .mockResolvedValueOnce(problem(401, 'UNAUTHENTICATED'))
    const { apiFetch, ApiError } = await load()

    const error = await apiFetch('/api/users/me').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('INVALID_CREDENTIALS では更新しない', async () => {
    fetchMock.mockResolvedValueOnce(problem(401, 'INVALID_CREDENTIALS'))
    const { apiFetch, ApiError } = await load()

    const error = await apiFetch('/api/x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('同時に 3 本が 401 になっても更新は 1 回', async () => {
    fetchMock.mockImplementation(async (path: string, init: RequestInit) => {
      if (path === '/api/auth/refresh') return ok({ accessToken: 'new', user: me })
      const authorization = new Headers(init.headers).get('Authorization')
      return authorization === 'Bearer new' ? ok(me) : problem(401, 'UNAUTHENTICATED')
    })
    const { apiFetch, setAccessToken } = await load()
    setAccessToken('old')

    const results = await Promise.all([apiFetch('/api/a'), apiFetch('/api/b'), apiFetch('/api/c')])

    expect(results).toHaveLength(3)
    const refreshCalls = fetchMock.mock.calls.filter((call) => call[0] === '/api/auth/refresh')
    expect(refreshCalls).toHaveLength(1)
  })

  it('problem+json でない応答は code が null', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>Too Many Requests</html>', { status: 429, headers: { 'Content-Type': 'text/html' } }),
    )
    const { apiFetch, ApiError } = await load()

    const error = await apiFetch('/api/x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 429, code: null, detail: '通信に失敗しました', errors: [], requestId: null })
  })

  it('X-Request-Id ヘッダーを本文に requestId が無いときの代わりにする', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('bad gateway', { status: 502, headers: { 'Content-Type': 'text/plain', 'X-Request-Id': 'hdr-1' } }),
    )
    const { apiFetch } = await load()

    const error = await apiFetch('/api/x').catch((e: unknown) => e)

    expect(error).toMatchObject({ status: 502, code: null, requestId: 'hdr-1' })
  })

  it('fetch 自体が失敗したら status 0 の ApiError にする', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { apiFetch, ApiError } = await load()

    const error = await apiFetch('/api/x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 0, code: null, detail: '通信に失敗しました', requestId: null })
  })
})

describe('認証の API', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('認証の API は Bearer を付けない', async () => {
    fetchMock.mockResolvedValueOnce(ok({ accessToken: 'x', user: me }))
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { login, logout, setAccessToken } = await load()
    setAccessToken('t')

    await login({ email: 'alice@example.com', password: 'pw' })
    await logout()

    expect(authorizationOf(fetchMock.mock.calls[0])).toBeNull()
    expect(authorizationOf(fetchMock.mock.calls[1])).toBeNull()
  })

  it('register と refresh も Bearer を付けない', async () => {
    fetchMock.mockImplementation(async () => ok({ accessToken: 'x', user: me }))
    const { register, refresh, setAccessToken } = await load()
    setAccessToken('t')

    await register({ username: 'alice', displayName: 'Alice', email: 'alice@example.com', password: 'pw' })
    await refresh()

    expect(authorizationOf(fetchMock.mock.calls[0])).toBeNull()
    expect(authorizationOf(fetchMock.mock.calls[1])).toBeNull()
  })

  it('logout は 401 UNAUTHENTICATED でも更新しない', async () => {
    fetchMock.mockResolvedValueOnce(problem(401, 'UNAUTHENTICATED'))
    const { logout } = await load()

    await expect(logout()).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('各 API は決められた経路と方法で呼ぶ', async () => {
    fetchMock.mockImplementation(async () => ok({ accessToken: 'x', user: me }))
    const { register, login, refresh } = await load()

    await register({ username: 'a', displayName: 'A', email: 'a@example.com', password: 'pw' })
    await login({ email: 'a@example.com', password: 'pw' })
    await refresh()

    const calls = fetchMock.mock.calls.map((c) => [c[0], (c[1] as RequestInit).method])
    expect(calls).toEqual([
      ['/api/auth/register', 'POST'],
      ['/api/auth/login', 'POST'],
      ['/api/auth/refresh', 'POST'],
    ])
  })
})
