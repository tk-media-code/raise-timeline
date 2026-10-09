import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse, Me } from '../../api/auth'
import { ApiError } from '../../api/client'
import { AuthProvider } from '../../auth/AuthProvider'
import { refreshSession } from '../../auth/refresh'
import { RequireAuth } from '../../auth/RequireAuth'
import { setAccessToken } from '../../auth/tokenStore'
import { queryClient } from '../../lib/queryClient'
import { ToastProvider } from '../Toast'
import { AppLayout } from './AppLayout'

// 本物の AuthProvider・RequireAuth・AppLayout を組み合わせ、ネットワークに出る API だけを差し替える。
// ログアウト後の移動は、場所の更新が startTransition で包まれる実物の組み合わせでしか確かめられない。
const apiRefresh = vi.hoisted(() => vi.fn())
const apiLogout = vi.hoisted(() => vi.fn())
vi.mock('../../api/auth', () => ({ refresh: apiRefresh, logout: apiLogout }))

const me: Me = {
  id: '1',
  username: 'alice',
  displayName: 'アリス',
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

function Where() {
  const { pathname, search } = useLocation()
  return (
    <p data-testid="where">
      {pathname}|{search}
    </p>
  )
}

function renderApp() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/users/alice']}>
          <AuthProvider>
            <Routes>
              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>
                  <Route path="/users/:username" element={<p>プロフィール画面</p>} />
                </Route>
              </Route>
              <Route path="/login" element={<Where />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('ログアウトの移動（本物の AuthProvider と RequireAuth）', () => {
  beforeEach(() => {
    apiRefresh.mockReset()
    apiLogout.mockReset()
    apiLogout.mockResolvedValue(undefined)
    apiRefresh.mockResolvedValue(session)
    setAccessToken(null)
    queryClient.clear()
  })

  it('明示のログアウトでは、next を付けずに /login へ着く', async () => {
    renderApp()
    const nav = await screen.findByRole('navigation', { name: 'メインメニュー' })
    expect(screen.getByText('プロフィール画面')).toBeInTheDocument()

    await userEvent.click(within(nav).getByRole('button', { name: 'ログアウト' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ログアウト' }))

    expect(await screen.findByTestId('where')).toHaveTextContent('/login|')
    expect(screen.getByTestId('where').textContent).toBe('/login|')
    expect(apiLogout).toHaveBeenCalledTimes(1)
  })

  it('期限切れ（onSessionExpired）では、従来どおり next を付けて /login へ着く', async () => {
    renderApp()
    await screen.findByRole('navigation', { name: 'メインメニュー' })

    // 更新が 401 になった状態を作る。実物の refresh.ts は mock した API の失敗を通知する。
    apiRefresh.mockRejectedValue(
      new ApiError({ status: 401, code: 'INVALID_REFRESH_TOKEN', detail: '再ログインしてください', errors: [], requestId: 'r' }),
    )
    await act(async () => {
      await refreshSession()
    })

    expect(await screen.findByTestId('where')).toHaveTextContent('/login|?next=%2Fusers%2Falice')
  })
})
