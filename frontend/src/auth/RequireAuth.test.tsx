import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from './AuthProvider'
import { RedirectIfAuthenticated } from './RedirectIfAuthenticated'
import { RequireAuth } from './RequireAuth'

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('./AuthProvider', () => ({ useAuth }))

function setAuth(status: AuthContextValue['status'], signedOut = false) {
  useAuth.mockReturnValue({ status, user: null, signedOut, signIn: vi.fn(), signOut: vi.fn() })
}

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/users/:name" element={<p>保護されたページ</p>} />
        </Route>
        <Route element={<RedirectIfAuthenticated />}>
          <Route path="/login" element={<p>ログイン画面</p>} />
        </Route>
        <Route path="/" element={<p>ホーム</p>} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  it('移り先の next に元のパスとクエリを載せる', () => {
    setAuth('anonymous')
    render(
      <MemoryRouter initialEntries={['/users/alice?tab=1']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/users/:name" element={<p>保護されたページ</p>} />
          </Route>
          <Route path="/login" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Fusers%2Falice%3Ftab%3D1')
  })

  it('自分でログアウトしたあとの anonymous では、next を付けずに /login へ移る', () => {
    setAuth('anonymous', true)
    render(
      <MemoryRouter initialEntries={['/users/alice?tab=1']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/users/:name" element={<p>保護されたページ</p>} />
          </Route>
          <Route path="/login" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('where').textContent).toBe('/login')
  })

  it('/users/alice から /login?next=%2Fusers%2Falice に移る', () => {
    setAuth('anonymous')
    render(
      <MemoryRouter initialEntries={['/users/alice']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/users/:name" element={<p>保護されたページ</p>} />
          </Route>
          <Route path="/login" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Fusers%2Falice')
    expect(screen.queryByText('保護されたページ')).not.toBeInTheDocument()
  })

  it('ログイン済みなら中身を描く', () => {
    setAuth('authenticated')

    renderAt('/users/alice')

    expect(screen.getByText('保護されたページ')).toBeInTheDocument()
  })

  it('loading の間はスピナーを出し、中身も移動もしない', () => {
    setAuth('loading')

    renderAt('/users/alice')

    expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument()
    expect(screen.queryByText('保護されたページ')).not.toBeInTheDocument()
    expect(screen.queryByText('ログイン画面')).not.toBeInTheDocument()
  })
})

describe('RedirectIfAuthenticated', () => {
  it('ログイン済みで /login を開くと / へ', () => {
    setAuth('authenticated')

    renderAt('/login')

    expect(screen.getByText('ホーム')).toBeInTheDocument()
    expect(screen.queryByText('ログイン画面')).not.toBeInTheDocument()
  })

  it('ログイン済みで /login?next=%2Fsettings を開くと /settings へ', () => {
    setAuth('authenticated')

    renderAt('/login?next=%2Fsettings')

    expect(screen.getByTestId('where')).toHaveTextContent('/settings')
    expect(screen.queryByText('ログイン画面')).not.toBeInTheDocument()
  })

  it('ログイン済みで /login?next=%2F%2Fevil.example を開くと / へ', () => {
    setAuth('authenticated')

    renderAt('/login?next=%2F%2Fevil.example')

    expect(screen.getByText('ホーム')).toBeInTheDocument()
  })

  it('未ログインなら /login の中身を描く', () => {
    setAuth('anonymous')

    renderAt('/login')

    expect(screen.getByText('ログイン画面')).toBeInTheDocument()
  })

  it('loading の間は /login の中身を描く（ログイン画面が見えなくならない）', () => {
    setAuth('loading')

    renderAt('/login')

    expect(screen.getByText('ログイン画面')).toBeInTheDocument()
  })
})
