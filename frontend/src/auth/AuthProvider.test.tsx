import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse, Me } from '../api/auth'
import { queryClient } from '../lib/queryClient'
import { AuthProvider, useAuth } from './AuthProvider'
import { getAccessToken, setAccessToken } from './tokenStore'

const refreshSession = vi.hoisted(() => vi.fn())
const onSessionExpired = vi.hoisted(() => vi.fn())
const logout = vi.hoisted(() => vi.fn())

vi.mock('./refresh', () => ({ refreshSession, onSessionExpired }))
vi.mock('../api/auth', () => ({ logout }))

const me: Me = {
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
const session: AuthResponse = { accessToken: 'token-1', user: me }

function Probe() {
  const { status, user, signIn, signOut } = useAuth()
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.username ?? 'none'}</p>
      <button onClick={() => signIn(session)}>サインイン</button>
      <button onClick={() => void signOut()}>サインアウト</button>
    </div>
  )
}

function renderProvider() {
  return render(
    <StrictMode>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </StrictMode>,
  )
}

// onSessionExpired に渡された購読者を取り出す。テストが「途中で更新が 401 になった」を起こすために使う。
let expiredListeners: Array<() => void>

describe('AuthProvider', () => {
  beforeEach(() => {
    refreshSession.mockReset()
    logout.mockReset()
    onSessionExpired.mockReset()
    expiredListeners = []
    onSessionExpired.mockImplementation((listener: () => void) => {
      expiredListeners.push(listener)
      return () => {
        expiredListeners = expiredListeners.filter((l) => l !== listener)
      }
    })
    setAccessToken(null)
    queryClient.clear()
  })

  it('起動時に更新を 1 回だけ呼ぶ（StrictMode でも）', async () => {
    refreshSession.mockResolvedValue(session)

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(refreshSession).toHaveBeenCalledTimes(1)
  })

  it('更新の結果が出るまでは loading', async () => {
    let resolve: (value: AuthResponse | null) => void = () => {}
    refreshSession.mockReturnValue(new Promise((r) => (resolve = r)))

    renderProvider()

    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    await act(async () => resolve(null))
    expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
  })

  it('更新が成功すると authenticated になり、利用者を持つ', async () => {
    refreshSession.mockResolvedValue(session)

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('user')).toHaveTextContent('alice')
  })

  it('更新が失敗（null）すると anonymous になる', async () => {
    refreshSession.mockResolvedValue(null)

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('起動時の更新が 500 で失敗しても anonymous になる', async () => {
    refreshSession.mockRejectedValue(new Error('500'))

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
  })

  it('signIn で authenticated になり、トークンを保持する', async () => {
    refreshSession.mockResolvedValue(null)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))

    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))

    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('alice')
    expect(getAccessToken()).toBe('token-1')
  })

  it('signOut でログアウト API を呼び、トークンと利用者とキャッシュを捨てて anonymous に戻る', async () => {
    refreshSession.mockResolvedValue(session)
    logout.mockResolvedValue(undefined)
    setAccessToken('token-1')
    queryClient.setQueryData(['timeline'], ['post'])
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await userEvent.click(screen.getByRole('button', { name: 'サインアウト' }))

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(logout).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('user')).toHaveTextContent('none')
    expect(getAccessToken()).toBeNull()
    expect(queryClient.getQueryData(['timeline'])).toBeUndefined()
  })

  it('ログアウト API が失敗しても anonymous に戻る', async () => {
    refreshSession.mockResolvedValue(session)
    logout.mockRejectedValue(new Error('network'))
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await userEvent.click(screen.getByRole('button', { name: 'サインアウト' }))

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(getAccessToken()).toBeNull()
  })

  it('途中で更新が 401 になると anonymous になる', async () => {
    refreshSession.mockResolvedValue(session)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    act(() => {
      expiredListeners.forEach((listener) => listener())
    })

    expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('更新の途中で signIn すると、遅れて届いた null で anonymous に戻らない', async () => {
    let resolve: (value: AuthResponse | null) => void = () => {}
    refreshSession.mockReturnValue(new Promise((r) => (resolve = r)))
    renderProvider()
    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')

    await act(async () => resolve(null))

    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('alice')
    expect(getAccessToken()).toBe('token-1')
  })

  it('更新の途中で signIn すると、遅れて届いた別の人の成功で上書きされない', async () => {
    let resolve: (value: AuthResponse | null) => void = () => {}
    refreshSession.mockReturnValue(new Promise((r) => (resolve = r)))
    renderProvider()
    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))

    await act(async () => resolve({ accessToken: 'token-2', user: { ...me, username: 'bob' } }))

    expect(screen.getByTestId('user')).toHaveTextContent('alice')
    expect(getAccessToken()).toBe('token-1')
  })

  it('アンマウントすると購読を解く', async () => {
    refreshSession.mockResolvedValue(session)
    const { unmount } = renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    unmount()

    expect(expiredListeners).toHaveLength(0)
  })

  it('Provider の外で useAuth を呼ぶと投げる', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow()
    spy.mockRestore()
  })
})
