import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse } from '../api/auth'
import { ApiError } from '../api/client'
import LoginPage from './LoginPage'

const login = vi.hoisted(() => vi.fn())
vi.mock('../api/auth', () => ({ login }))

const signIn = vi.hoisted(() => vi.fn())
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ signIn }) }))

const response = {
  accessToken: 'token',
  user: { id: 'u1', username: 'alice_01' },
} as unknown as AuthResponse

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<p>登録画面</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillValid() {
  await userEvent.type(screen.getByLabelText('メールアドレス'), 'alice@example.com')
  await userEvent.type(screen.getByLabelText('パスワード'), 'password1!')
}

function problem(init: Partial<ConstructorParameters<typeof ApiError>[0]>) {
  return new ApiError({ status: 400, code: null, detail: '入力に誤りがあります', errors: [], requestId: null, ...init })
}

describe('LoginPage', () => {
  beforeEach(() => {
    login.mockReset()
    signIn.mockReset()
  })

  it('2 つの項目と、ログインボタンと、アカウントを作るへのリンクを出す', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('メールアドレス')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('パスワード')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('パスワード')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'アカウントを作る' })).toHaveAttribute('href', '/register')
  })

  it('空のまま送ると項目の下に「入力してください」が出て送信しない', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(screen.getAllByText('入力してください')).toHaveLength(2)
    expect(screen.getByLabelText('メールアドレス')).toHaveAttribute('aria-invalid', 'true')
    expect(login).not.toHaveBeenCalled()
  })

  it('失敗すると上部に「メールアドレスまたはパスワードが違います」が出て、入力は消えない', async () => {
    login.mockRejectedValue(
      problem({ status: 401, code: 'INVALID_CREDENTIALS', detail: 'メールアドレスまたはパスワードが違います' }),
    )
    renderPage()
    await fillValid()

    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('メールアドレスまたはパスワードが違います')
    expect(alert).toHaveAttribute('id', 'login-error')
    // どちらの項目が違うかは示さない。項目の下には何も出さない。
    expect(screen.getByLabelText('メールアドレス')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('パスワード')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('メールアドレス')).toHaveValue('alice@example.com')
    expect(screen.getByLabelText('パスワード')).toHaveValue('password1!')
    expect(signIn).not.toHaveBeenCalled()
  })

  it('500 のとき上部に ID 付きの文言が出る', async () => {
    login.mockRejectedValue(problem({ status: 500, detail: 'サーバーで問題が起きました', requestId: 'req-123' }))
    renderPage()
    await fillValid()

    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('サーバーで問題が起きました（ID: req-123）')
  })

  it('ApiError 以外の例外は、上部に通信失敗を出してボタンを戻す', async () => {
    login.mockRejectedValue(new TypeError('boom'))
    renderPage()
    await fillValid()

    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('通信に失敗しました')
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled()
  })

  it('成功すると signIn を応答で呼ぶ（画面は移動しない）', async () => {
    login.mockResolvedValue(response)
    renderPage()
    await fillValid()

    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    await waitFor(() => expect(signIn).toHaveBeenCalledWith(response))
    expect(login).toHaveBeenCalledWith({ email: 'alice@example.com', password: 'password1!' })
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument()
    expect(screen.queryByText('登録画面')).not.toBeInTheDocument()
  })

  it('再送信すると前の失敗の文言を消す', async () => {
    login.mockRejectedValueOnce(problem({ status: 401, detail: 'メールアドレスまたはパスワードが違います' }))
    login.mockResolvedValueOnce(response)
    renderPage()
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))
    await screen.findByRole('alert')

    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    await waitFor(() => expect(signIn).toHaveBeenCalledWith(response))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('送信中はボタンが無効で、二重に送らない', async () => {
    let resolve: (value: AuthResponse) => void = () => {}
    login.mockReturnValue(
      new Promise<AuthResponse>((r) => {
        resolve = r
      }),
    )
    renderPage()
    await fillValid()

    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    const button = screen.getByRole('button', { name: 'ログイン' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(login).toHaveBeenCalledTimes(1)

    resolve(response)
    await waitFor(() => expect(button).toBeEnabled())
  })
})
