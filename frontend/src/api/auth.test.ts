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
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

async function load() {
  return await import('./auth')
}

describe('認証の API と鍵', () => {
  const fetchMock = vi.fn()
  // 偽の navigator.locks。callback が動いている間だけ held が true になる。
  let held: boolean
  let lockNames: string[]
  let heldAtFetch: Array<{ path: string; held: boolean }>

  beforeEach(() => {
    vi.resetModules()
    held = false
    lockNames = []
    heldAtFetch = []
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (path: string) => {
      heldAtFetch.push({ path, held })
      return path === '/api/auth/logout' ? new Response(null, { status: 204 }) : ok({ accessToken: 'x', user: me })
    })
    vi.stubGlobal('fetch', fetchMock)
    const request = vi.fn(async (name: string, callback: () => Promise<unknown>) => {
      lockNames.push(name)
      held = true
      try {
        return await callback()
      } finally {
        held = false
      }
    })
    vi.stubGlobal('navigator', { ...navigator, locks: { request } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('登録・ログイン・ログアウトの要求は、auth-refresh の鍵を持っている間に送る', async () => {
    const { register, login, logout } = await load()

    await register({ username: 'alice', displayName: 'Alice', email: 'alice@example.com', password: 'pw' })
    await login({ email: 'alice@example.com', password: 'pw' })
    await logout()

    expect(heldAtFetch).toEqual([
      { path: '/api/auth/register', held: true },
      { path: '/api/auth/login', held: true },
      { path: '/api/auth/logout', held: true },
    ])
    expect(lockNames).toEqual(['auth-refresh', 'auth-refresh', 'auth-refresh'])
  })

  it('鍵は終わったら手放す', async () => {
    const { login } = await load()

    await login({ email: 'alice@example.com', password: 'pw' })

    expect(held).toBe(false)
  })

  it('refresh() は鍵を取らない（鍵は refreshSession が取る）', async () => {
    const { refresh } = await load()

    await refresh()

    expect(lockNames).toEqual([])
    expect(heldAtFetch).toEqual([{ path: '/api/auth/refresh', held: false }])
  })

  it('navigator.locks が無ければ、そのまま送る', async () => {
    vi.stubGlobal('navigator', { ...navigator, locks: undefined })
    const { login } = await load()

    await expect(login({ email: 'alice@example.com', password: 'pw' })).resolves.toMatchObject({ accessToken: 'x' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
