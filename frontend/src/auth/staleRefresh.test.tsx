import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse, Me } from '../api/auth'
import { ApiError } from '../api/client'
import { queryClient } from '../lib/queryClient'
import { AuthProvider, useAuth } from './AuthProvider'
import { refreshSession } from './refresh'
import { getAccessToken, setAccessToken } from './tokenStore'

// 本物の refresh.ts と本物の AuthProvider を組み合わせ、ネットワークに出る API だけを差し替える。
// ここでは「signIn・signOut が世代を進めること」を確かめる。refresh.ts を mock する AuthProvider.test.tsx では、
// 世代の検査が走らないので、signIn・signOut の世代を進める行を消してもテストが落ちない。
const apiRefresh = vi.hoisted(() => vi.fn())
const apiLogout = vi.hoisted(() => vi.fn())
vi.mock('../api/auth', () => ({ refresh: apiRefresh, logout: apiLogout }))

function makeUser(username: string): Me {
  return {
    id: username,
    username,
    displayName: username,
    avatarUrl: null,
    bio: '',
    isFollowing: false,
    followersCount: 0,
    followingCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    isMe: true,
    email: `${username}@example.com`,
  }
}
const alice: AuthResponse = { accessToken: 'token-1', user: makeUser('alice') }
const bob: AuthResponse = { accessToken: 'token-2', user: makeUser('bob') }

function unauthorized(): ApiError {
  return new ApiError({
    status: 401,
    code: 'INVALID_REFRESH_TOKEN',
    detail: '再ログインしてください',
    errors: [],
    requestId: 'req-1',
  })
}

function Probe() {
  const { status, user, signIn, signOut } = useAuth()
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.username ?? 'none'}</p>
      <button onClick={() => signIn(alice)}>サインイン</button>
      <button onClick={() => void signOut()}>サインアウト</button>
    </div>
  )
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('古い更新の結果を捨てる（本物の refresh と AuthProvider）', () => {
  beforeEach(() => {
    apiRefresh.mockReset()
    apiLogout.mockReset()
    apiLogout.mockResolvedValue(undefined)
    setAccessToken(null)
    queryClient.clear()
  })

  it('起動時の更新の途中で signIn すると、遅れて届いた 401 でログアウトにも、トークン消去にもならない', async () => {
    const startup = deferred<AuthResponse>()
    apiRefresh.mockReturnValue(startup.promise)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')

    await act(async () => startup.reject(unauthorized()))

    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('alice')
    expect(getAccessToken()).toBe('token-1')
  })

  it('更新の途中で signOut すると、遅れて届いた成功がトークンを書き戻さない', async () => {
    // 起動時の更新は alice で成功させ、ログイン済みの状態から始める。
    apiRefresh.mockResolvedValueOnce(alice)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(getAccessToken()).toBe('token-1')

    // 画面の途中の更新を出したまま、ログアウトする。
    const inFlight = deferred<AuthResponse>()
    apiRefresh.mockReturnValueOnce(inFlight.promise)
    const pending = refreshSession()
    await userEvent.click(screen.getByRole('button', { name: 'サインアウト' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(getAccessToken()).toBeNull()

    await act(async () => {
      inFlight.resolve(bob)
      await pending
    })

    expect(getAccessToken()).toBeNull()
    expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })
})
