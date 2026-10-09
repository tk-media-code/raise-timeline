import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse, Me } from '../api/auth'
import { AuthProvider, useAuth } from './AuthProvider'
import { RedirectIfAuthenticated } from './RedirectIfAuthenticated'
import { setAccessToken } from './tokenStore'

// ネットワークに出る更新だけを差し替え、AuthProvider と RedirectIfAuthenticated は本物を使う。
// ログイン後の移動は、場所の更新が startTransition で包まれる実物の組み合わせでしか確かめられない。
const refreshSession = vi.hoisted(() => vi.fn())
vi.mock('./refresh', () => ({ refreshSession, onSessionExpired: () => () => {} }))

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

// ログイン画面の代役。本物のログイン画面と同じく、signIn を呼ぶだけで自分では移動しない。
function LoginStub() {
  const { signIn } = useAuth()
  return <button onClick={() => signIn(session)}>ログインする</button>
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route element={<RedirectIfAuthenticated />}>
            <Route path="/login" element={<LoginStub />} />
          </Route>
          <Route path="/settings" element={<p>設定画面</p>} />
          <Route path="/" element={<p>ホーム</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('ログイン後の移動', () => {
  beforeEach(() => {
    refreshSession.mockReset()
    refreshSession.mockResolvedValue(null)
    setAccessToken(null)
  })

  it('/login?next=%2Fsettings でログインすると /settings に着く', async () => {
    renderAt('/login?next=%2Fsettings')
    const button = await screen.findByRole('button', { name: 'ログインする' })

    await userEvent.click(button)

    expect(await screen.findByText('設定画面')).toBeInTheDocument()
    expect(screen.queryByText('ホーム')).not.toBeInTheDocument()
  })

  it('next が無ければ / に着く', async () => {
    renderAt('/login')
    const button = await screen.findByRole('button', { name: 'ログインする' })

    await userEvent.click(button)

    expect(await screen.findByText('ホーム')).toBeInTheDocument()
  })

  it('起動時の更新が終わる前にログインしても next に着く', async () => {
    let resolve: (value: AuthResponse | null) => void = () => {}
    refreshSession.mockReturnValue(new Promise((r) => (resolve = r)))
    renderAt('/login?next=%2Fsettings')

    await userEvent.click(screen.getByRole('button', { name: 'ログインする' }))
    await act(async () => resolve(null))

    expect(await screen.findByText('設定画面')).toBeInTheDocument()
  })
})
