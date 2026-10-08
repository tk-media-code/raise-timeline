import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse, Me } from './api/auth'
import { ApiError } from './api/client'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { setAccessToken } from './auth/tokenStore'
import { queryClient } from './lib/queryClient'

// 本物の AuthProvider・refresh.ts・各ページとルートを組み合わせ、ネットワークに出る API だけを差し替える。
// ログイン後の移動は、場所の更新が startTransition で包まれる実物の組み合わせでしか確かめられない。
const apiRefresh = vi.hoisted(() => vi.fn())
const apiLogin = vi.hoisted(() => vi.fn())
const apiRegister = vi.hoisted(() => vi.fn())
const apiLogout = vi.hoisted(() => vi.fn())
vi.mock('./api/auth', () => ({
  refresh: apiRefresh,
  login: apiLogin,
  register: apiRegister,
  logout: apiLogout,
}))

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

function unauthorized(): ApiError {
  return new ApiError({ status: 401, code: 'INVALID_REFRESH_TOKEN', detail: '再ログインしてください', errors: [], requestId: null })
}

// 場所を画面の外から見るための印。まだ無い /settings に着いたことを確かめるのに使う。
function LocationProbe() {
  const { pathname, search } = useLocation()
  return <p data-testid="location">{pathname + search}</p>
}

function renderAt(entry: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <AuthProvider>
          <App />
          <LocationProbe />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('App のルート', () => {
  beforeEach(() => {
    apiRefresh.mockReset()
    apiLogin.mockReset()
    apiRegister.mockReset()
    apiLogout.mockReset()
    setAccessToken(null)
    queryClient.clear()
    // 既定は未ログイン（起動時の更新が 401）。
    apiRefresh.mockRejectedValue(unauthorized())
  })

  it('未ログインで / を開くと /login?next=%2F に移る', async () => {
    renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'ログイン' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/login?next=%2F')
  })

  it('ログイン済みで / を開くとレイアウトとホームが描かれる', async () => {
    apiRefresh.mockResolvedValue(session)
    renderAt('/')

    expect(await screen.findByText('タイムラインは次の Issue で作ります')).toBeInTheDocument()
    expect(screen.getByRole('banner', { name: '上部バー' })).toBeInTheDocument()
    // AppLayout の <main> の中に描かれ、<main> が入れ子にならない。
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it('存在しないパスは「ページが見つかりません」とホームへのリンクを出す', async () => {
    renderAt('/no-such-page')

    expect(await screen.findByText('ページが見つかりません')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ホームへ' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('banner', { name: '上部バー' })).not.toBeInTheDocument()
  })

  it('ログイン済みの人が /login を開くと / に移る', async () => {
    apiRefresh.mockResolvedValue(session)
    renderAt('/login')

    expect(await screen.findByText('タイムラインは次の Issue で作ります')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  })

  it('/login?next=%2Fsettings でログインすると /settings に移る', async () => {
    apiLogin.mockResolvedValue(session)
    renderAt('/login?next=%2Fsettings')
    await userEvent.type(await screen.findByLabelText('メールアドレス'), 'alice@example.com')
    await userEvent.type(screen.getByLabelText('パスワード'), 'password1!')

    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(await screen.findByText('ページが見つかりません')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/settings$/)
    expect(apiLogin).toHaveBeenCalledWith({ email: 'alice@example.com', password: 'password1!' })
  })

  it('/register で登録すると / に移る', async () => {
    apiRegister.mockResolvedValue(session)
    renderAt('/register')
    await userEvent.type(await screen.findByLabelText('ユーザー名'), 'alice')
    await userEvent.type(screen.getByLabelText('表示名'), 'Alice')
    await userEvent.type(screen.getByLabelText('メールアドレス'), 'alice@example.com')
    await userEvent.type(screen.getByLabelText('パスワード'), 'password1!')

    await userEvent.click(screen.getByRole('button', { name: '登録する' }))

    expect(await screen.findByText('タイムラインは次の Issue で作ります')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  })
})
