import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse, Me } from '../api/auth'
import { queryClient } from '../lib/queryClient'
import { AuthProvider, useAuth } from './AuthProvider'
import { AUTH_CHANNEL_NAME } from './authChannel'
import { getAccessToken, getSessionUserId, setAccessToken, setSessionUserId } from './tokenStore'

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
const bobSession: AuthResponse = { accessToken: 'token-2', user: { ...me, id: '2', username: 'bob' } }

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function Probe() {
  const { status, user, signedOut, signIn, signOut } = useAuth()
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="signed-out">{String(signedOut)}</p>
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
  // 別のタブ。Node の BroadcastChannel は同じプロセスの中のインスタンス同士に届ける。
  let otherTab: BroadcastChannel
  let receivedByOtherTab: unknown[]

  beforeEach(() => {
    receivedByOtherTab = []
    otherTab = new BroadcastChannel(AUTH_CHANNEL_NAME)
    otherTab.onmessage = (event: MessageEvent) => receivedByOtherTab.push(event.data)
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
    setSessionUserId(null)
    queryClient.clear()
  })

  afterEach(() => {
    otherTab.close()
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

  it('signOut の後だけ signedOut が true になり、signIn で false に戻る。起動時の失敗では false のまま', async () => {
    refreshSession.mockResolvedValueOnce(null)
    logout.mockResolvedValue(undefined)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(screen.getByTestId('signed-out')).toHaveTextContent('false')

    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))
    await userEvent.click(screen.getByRole('button', { name: 'サインアウト' }))
    await waitFor(() => expect(screen.getByTestId('signed-out')).toHaveTextContent('true'))

    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))
    expect(screen.getByTestId('signed-out')).toHaveTextContent('false')
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
  })

  it('更新の途中で signIn すると、遅れて届いた別の人の成功で上書きされない', async () => {
    let resolve: (value: AuthResponse | null) => void = () => {}
    refreshSession.mockReturnValue(new Promise((r) => (resolve = r)))
    renderProvider()
    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))

    await act(async () => resolve({ accessToken: 'token-2', user: { ...me, username: 'bob' } }))

    expect(screen.getByTestId('user')).toHaveTextContent('alice')
  })

  it('期限切れで未ログインになると、TanStack Query のキャッシュを消す', async () => {
    refreshSession.mockResolvedValue(session)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    queryClient.setQueryData(['x'], 1)

    act(() => {
      expiredListeners.forEach((listener) => listener())
    })

    expect(screen.getByTestId('status')).toHaveTextContent('anonymous')
    expect(queryClient.getQueryData(['x'])).toBeUndefined()
  })

  it('signIn と signOut の後に、他のタブへ auth-changed を 1 回ずつ送る', async () => {
    refreshSession.mockResolvedValue(null)
    logout.mockResolvedValue(undefined)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))

    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))
    await waitFor(() => expect(receivedByOtherTab).toEqual([{ type: 'auth-changed' }]))

    await userEvent.click(screen.getByRole('button', { name: 'サインアウト' }))
    await waitFor(() => expect(receivedByOtherTab).toEqual([{ type: 'auth-changed' }, { type: 'auth-changed' }]))
  })

  it('signIn はこのタブの利用者の id を覚え、signOut は忘れる', async () => {
    refreshSession.mockResolvedValue(null)
    logout.mockResolvedValue(undefined)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))

    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))
    expect(getSessionUserId()).toBe('1')

    await userEvent.click(screen.getByRole('button', { name: 'サインアウト' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(getSessionUserId()).toBeNull()
  })

  it('ログアウト API が失敗しても、他のタブへ auth-changed を送る', async () => {
    refreshSession.mockResolvedValue(session)
    logout.mockRejectedValue(new Error('network'))
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await userEvent.click(screen.getByRole('button', { name: 'サインアウト' }))

    await waitFor(() => expect(receivedByOtherTab).toEqual([{ type: 'auth-changed' }]))
  })

  it('他のタブの auth-changed で、キャッシュとトークンを捨てて取り直し、返った利用者でログイン状態になる', async () => {
    refreshSession.mockResolvedValueOnce(session)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    // refreshSession は mock なので、トークンと利用者 id は、更新が済んだ状態をテストが置く。
    setAccessToken('token-1')
    setSessionUserId('1')
    queryClient.setQueryData(['x'], 1)
    const retry = deferred<AuthResponse | null>()
    refreshSession.mockReturnValueOnce(retry.promise)

    otherTab.postMessage({ type: 'auth-changed' })

    // 取り直しの間は読み込み中。トークンとキャッシュは、結果を待たずに捨てる。
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('loading'))
    expect(getAccessToken()).toBeNull()
    expect(getSessionUserId()).toBeNull()
    expect(queryClient.getQueryData(['x'])).toBeUndefined()

    await act(async () => retry.resolve(bobSession))

    expect(refreshSession).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('bob')
  })

  it('取り直しが 401 なら未ログインになり、signedOut は false', async () => {
    refreshSession.mockResolvedValueOnce(session)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    refreshSession.mockResolvedValueOnce(null)

    otherTab.postMessage({ type: 'auth-changed' })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(screen.getByTestId('signed-out')).toHaveTextContent('false')
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('取り直しが 500 などで失敗しても未ログインになる', async () => {
    refreshSession.mockResolvedValueOnce(session)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    refreshSession.mockRejectedValueOnce(new Error('500'))

    otherTab.postMessage({ type: 'auth-changed' })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(screen.getByTestId('signed-out')).toHaveTextContent('false')
  })

  it('取り直しの最中にもう一度届いたら、後の取り直しの結果だけが残る', async () => {
    refreshSession.mockResolvedValueOnce(session)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    const first = deferred<AuthResponse | null>()
    const second = deferred<AuthResponse | null>()
    refreshSession.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    otherTab.postMessage({ type: 'auth-changed' })
    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(2))
    otherTab.postMessage({ type: 'auth-changed' })
    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(3))

    // 後の取り直しが Y で返ったあとに、先の取り直しが X で返る。
    await act(async () => second.resolve(bobSession))
    await act(async () => first.resolve(session))

    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('bob')
  })

  it('取り直しの最中にもう一度届いたら、先の取り直しが先に返っても、その結果は残らない', async () => {
    refreshSession.mockResolvedValueOnce(session)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    const first = deferred<AuthResponse | null>()
    const second = deferred<AuthResponse | null>()
    refreshSession.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    otherTab.postMessage({ type: 'auth-changed' })
    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(2))
    otherTab.postMessage({ type: 'auth-changed' })
    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(3))

    // 先の取り直しが X で先に返る。状態はまだ loading だが、世代が違うので反映しない。
    await act(async () => first.resolve(session))
    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    expect(screen.getByTestId('user')).toHaveTextContent('none')

    await act(async () => second.resolve(bobSession))
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('bob')
  })

  it('取り直しの最中に signIn すると、遅れて届いた取り直しの結果で上書きされない', async () => {
    refreshSession.mockResolvedValueOnce(null)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    const retry = deferred<AuthResponse | null>()
    refreshSession.mockReturnValueOnce(retry.promise)

    otherTab.postMessage({ type: 'auth-changed' })
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('loading'))
    await userEvent.click(screen.getByRole('button', { name: 'サインイン' }))
    await act(async () => retry.resolve(bobSession))

    expect(screen.getByTestId('user')).toHaveTextContent('alice')
  })

  it('アンマウントすると、他のタブの知らせを受けなくなる', async () => {
    refreshSession.mockResolvedValue(session)
    const { unmount } = renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    unmount()
    const sender = new BroadcastChannel(AUTH_CHANNEL_NAME)
    const marker = new BroadcastChannel(AUTH_CHANNEL_NAME)
    const arrived = vi.fn()
    marker.onmessage = arrived

    sender.postMessage({ type: 'auth-changed' })
    await vi.waitFor(() => expect(arrived).toHaveBeenCalledTimes(1))
    sender.close()
    marker.close()

    expect(refreshSession).toHaveBeenCalledTimes(1)
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
