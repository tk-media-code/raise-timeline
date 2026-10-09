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

  it('401 で購読者が呼ばれ、購読を解くと呼ばれない', async () => {
    fetchMock.mockImplementation(async () => unauthorized())
    const { refreshSession, onSessionExpired } = await load()
    const kept = vi.fn()
    const removed = vi.fn()
    onSessionExpired(kept)
    const unsubscribe = onSessionExpired(removed)
    unsubscribe()

    await refreshSession()

    expect(kept).toHaveBeenCalledTimes(1)
    expect(removed).not.toHaveBeenCalled()
  })

  it('401 以外の失敗では購読者を呼ばない', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(500, { status: 500, code: 'INTERNAL_ERROR', detail: 'x', errors: [], requestId: 'r' }, 'application/problem+json'),
    )
    const { refreshSession, onSessionExpired } = await load()
    const listener = vi.fn()
    onSessionExpired(listener)

    await expect(refreshSession()).rejects.toMatchObject({ status: 500 })

    expect(listener).not.toHaveBeenCalled()
  })

  it('更新の途中で世代が進んだら、遅れて届いた 401 でトークンを消さず購読者も呼ばない', async () => {
    let respond: (response: Response) => void = () => {}
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (respond = r)))
    const { refreshSession, onSessionExpired, advanceSessionGeneration, getAccessToken, setAccessToken } =
      await load()
    const listener = vi.fn()
    onSessionExpired(listener)

    const pending = refreshSession()
    // 更新の応答を待つ間にログインした、という状況。
    advanceSessionGeneration()
    setAccessToken('signed-in')
    respond(unauthorized())

    await expect(pending).resolves.toBeNull()
    expect(getAccessToken()).toBe('signed-in')
    expect(listener).not.toHaveBeenCalled()
  })

  it('更新の途中で世代が進んだら、遅れて届いた成功でトークンを上書きしない', async () => {
    let respond: (response: Response) => void = () => {}
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (respond = r)))
    const { refreshSession, advanceSessionGeneration, getAccessToken, setAccessToken } = await load()

    const pending = refreshSession()
    advanceSessionGeneration()
    setAccessToken('signed-in')
    respond(jsonResponse(200, { accessToken: 'stale', user: me }))

    await expect(pending).resolves.toBeNull()
    expect(getAccessToken()).toBe('signed-in')
  })

  it('Web Locks があれば auth-refresh の鍵を持っている間に更新する', async () => {
    // 鍵を取れた瞬間と、鍵を持っている間かどうかをテストが握る。
    // 鍵の外で更新する実装だと、fetch が出た時点で held が false になる。
    const lock: { name: string | null; grant: (() => Promise<unknown>) | null; held: boolean } = {
      name: null,
      grant: null,
      held: false,
    }
    let heldAtFetch: boolean | null = null
    fetchMock.mockImplementation(async () => {
      heldAtFetch = lock.held
      return jsonResponse(200, { accessToken: 'new', user: me })
    })
    const request = vi.fn((name: string, callback: () => Promise<unknown>) => {
      lock.name = name
      return new Promise((resolve, reject) => {
        // callback をすぐには呼ばず保持する。テストが「鍵が取れた」と決めた時に呼ぶ。
        lock.grant = async () => {
          lock.held = true
          try {
            resolve(await callback())
          } catch (error) {
            reject(error)
          } finally {
            lock.held = false
          }
        }
      })
    })
    vi.stubGlobal('navigator', { ...navigator, locks: { request } })
    const { refreshSession } = await load()

    const pending = refreshSession()
    await Promise.resolve()

    // 鍵が取れるまでは、更新の要求を出さない。
    expect(lock.name).toBe('auth-refresh')
    expect(fetchMock).not.toHaveBeenCalled()

    await lock.grant?.()
    const result = await pending

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(heldAtFetch).toBe(true)
    expect(result?.accessToken).toBe('new')
  })
})
