import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse, Me } from './api/auth'
import { ApiError } from './api/client'
import type { Post } from './api/posts'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { setAccessToken } from './auth/tokenStore'
import { ToastProvider } from './components/Toast'
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

const detailPost: Post = {
  id: '11111111-1111-4111-8111-111111111111',
  author: { id: '1', username: 'alice', displayName: 'Alice', avatarUrl: null },
  body: '詳細の本文',
  images: [],
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  edited: false,
  createdAt: '2026-10-06T05:12:00Z',
}

// ホームのタイムラインと投稿詳細が呼ぶ API の代役。タイムラインは空のページ、詳細は detailPost を返す。
function stubTimelineFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.startsWith('/api/timeline/all')
        ? { items: [], nextCursor: null }
        : url === `/api/posts/${detailPost.id}`
          ? detailPost
          : url === `/api/posts/${detailPost.id}/likes`
            ? { items: [{ id: '2', username: 'bob', displayName: 'Bob', avatarUrl: null, bio: '', isFollowing: false }], nextCursor: null }
            : url === '/api/users/me'
              ? me
              : null
      return Promise.resolve(
        body === null
          ? new Response(null, { status: 404 })
          : new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      )
    }),
  )
}

// ホームが描かれたことの確かめ。見出しと、投稿フォームの「本文」欄がある。
async function findHome() {
  expect(await screen.findByRole('heading', { level: 1, name: 'ホーム' })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '本文' })).toBeInTheDocument()
}

function renderAt(entry: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[entry]}>
          <AuthProvider>
            <App />
            <LocationProbe />
          </AuthProvider>
        </MemoryRouter>
      </ToastProvider>
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
    stubTimelineFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('未ログインで / を開くと /login?next=%2F に移る', async () => {
    renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'ログイン' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/login?next=%2F')
  })

  it('ログイン済みで / を開くとレイアウトとホームが描かれる', async () => {
    apiRefresh.mockResolvedValue(session)
    renderAt('/')

    await findHome()
    expect(screen.getByRole('banner', { name: '上部バー' })).toBeInTheDocument()
    // AppLayout の <main> の中に描かれ、<main> が入れ子にならない。
    expect(screen.getAllByRole('main')).toHaveLength(1)
    // 見出しは各ページが持つ。レイアウトの上部バーは見出しにしない（PC 幅で隠れると h1 が無くなるため）。
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    // jsdom は CSS を当てないので、md:hidden の上部バーも描かれる。h1 が本文（main）の中にあることで、各ページが持つことを確かめる。
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1, name: 'ホーム' })).toBeInTheDocument()
  })

  it('ログイン済みで /posts/<id> を開くと、レイアウトの中に投稿詳細が描かれる', async () => {
    apiRefresh.mockResolvedValue(session)
    renderAt(`/posts/${detailPost.id}`)

    expect(await screen.findByText('詳細の本文')).toBeInTheDocument()
    expect(screen.getByRole('banner', { name: '上部バー' })).toBeInTheDocument()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1, name: '投稿' })).toBeInTheDocument()
    expect(screen.getByText('2026/10/06 14:12')).toBeInTheDocument()
  })

  it('ログイン済みで /posts/<id>/likes を開くと、レイアウトの中に「いいねした人」が描かれる', async () => {
    apiRefresh.mockResolvedValue(session)
    renderAt(`/posts/${detailPost.id}/likes`)

    expect(await screen.findByRole('link', { name: 'Bob @bob' })).toBeInTheDocument()
    expect(screen.getByRole('banner', { name: '上部バー' })).toBeInTheDocument()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1, name: 'いいねした人' })).toBeInTheDocument()
  })

  it('ログイン済みで /settings/profile を開くと、レイアウトの中にプロフィール編集が描かれる', async () => {
    apiRefresh.mockResolvedValue(session)
    renderAt('/settings/profile')

    expect(await screen.findByRole('textbox', { name: '表示名' })).toBeInTheDocument()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1, name: 'プロフィール編集' })).toBeInTheDocument()
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

    await findHome()
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

    await findHome()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  })
})
