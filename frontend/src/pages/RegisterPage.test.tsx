import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse } from '../api/auth'
import { ApiError } from '../api/client'
import RegisterPage from './RegisterPage'

const register = vi.hoisted(() => vi.fn())
vi.mock('../api/auth', () => ({ register }))

const signIn = vi.hoisted(() => vi.fn())
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ signIn }) }))

const response = {
  accessToken: 'token',
  user: { id: 'u1', username: 'alice_01' },
} as unknown as AuthResponse

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<p>ログイン画面</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillValid(overrides: Partial<Record<'username' | 'displayName' | 'email' | 'password', string>> = {}) {
  const values = {
    username: 'alice_01',
    displayName: 'アリス',
    email: 'alice@example.com',
    password: 'password1!',
    ...overrides,
  }
  await userEvent.type(screen.getByLabelText('ユーザー名'), values.username)
  await userEvent.type(screen.getByLabelText('表示名'), values.displayName)
  await userEvent.type(screen.getByLabelText('メールアドレス'), values.email)
  await userEvent.type(screen.getByLabelText('パスワード'), values.password)
}

function problem(init: Partial<ConstructorParameters<typeof ApiError>[0]>) {
  return new ApiError({ status: 400, code: null, detail: '入力に誤りがあります', errors: [], requestId: null, ...init })
}

describe('RegisterPage', () => {
  beforeEach(() => {
    register.mockReset()
    signIn.mockReset()
  })

  it('4 つの項目と、登録するボタンと、ログインへのリンクを出す', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('ユーザー名')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('表示名')).toHaveAttribute('autocomplete', 'nickname')
    expect(screen.getByLabelText('メールアドレス')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('メールアドレス')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('パスワード')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('パスワード')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByRole('button', { name: '登録する' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'ログインはこちら' })).toHaveAttribute('href', '/login')
  })

  it('誤りがあると項目の下に文言が出て送信しない', async () => {
    renderPage()
    await fillValid({ username: 'a-b', email: 'no-at-sign' })

    await userEvent.click(screen.getByRole('button', { name: '登録する' }))

    expect(screen.getByText('3〜20 文字の英数字と _ で入力してください')).toBeInTheDocument()
    expect(screen.getByText('メールアドレスの形式で入力してください')).toBeInTheDocument()
    expect(screen.getByLabelText('ユーザー名')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('1〜50 文字で入力してください')).not.toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
    // 失敗しても入力は消さない。
    expect(screen.getByLabelText('ユーザー名')).toHaveValue('a-b')
    expect(screen.getByLabelText('メールアドレス')).toHaveValue('no-at-sign')
  })

  it('登録に成功すると signIn を応答で呼ぶ（画面は移動しない）', async () => {
    register.mockResolvedValue(response)
    renderPage()
    await fillValid()

    await userEvent.click(screen.getByRole('button', { name: '登録する' }))

    await waitFor(() => expect(signIn).toHaveBeenCalledWith(response))
    expect(register).toHaveBeenCalledWith({
      username: 'alice_01',
      displayName: 'アリス',
      email: 'alice@example.com',
      password: 'password1!',
    })
    expect(screen.getByRole('button', { name: '登録する' })).toBeInTheDocument()
    expect(screen.queryByText('ログイン画面')).not.toBeInTheDocument()
  })

  it('表示名の前後の空白を取り除いて送る', async () => {
    register.mockResolvedValue(response)
    renderPage()
    await fillValid({ displayName: '  アリス  ' })

    await userEvent.click(screen.getByRole('button', { name: '登録する' }))

    await waitFor(() => expect(register).toHaveBeenCalled())
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'アリス' }))
  })

  it('409 の errors を項目の下に出し、入力は消さない', async () => {
    register.mockRejectedValue(
      problem({
        status: 409,
        code: 'USERNAME_TAKEN',
        detail: 'ユーザー名は使われています',
        errors: [{ field: 'username', message: 'このユーザー名は使われています' }],
      }),
    )
    renderPage()
    await fillValid()

    await userEvent.click(screen.getByRole('button', { name: '登録する' }))

    const message = await screen.findByText('このユーザー名は使われています')
    expect(message).toHaveAttribute('id', 'username-error')
    expect(message).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('ユーザー名')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('ユーザー名')).toHaveValue('alice_01')
    expect(screen.getByLabelText('パスワード')).toHaveValue('password1!')
    expect(signIn).not.toHaveBeenCalled()
  })

  it('項目に当たらない field の errors はフォーム上部に出す', async () => {
    register.mockRejectedValue(
      problem({ errors: [{ field: 'unknown', message: '知らない項目の誤り' }], detail: '入力に誤りがあります' }),
    )
    renderPage()
    await fillValid()

    await userEvent.click(screen.getByRole('button', { name: '登録する' }))

    const form = await screen.findByRole('region', { name: '登録の結果' })
    expect(form).toHaveTextContent('入力に誤りがあります')
    expect(screen.queryByText('知らない項目の誤り')).not.toBeInTheDocument()
  })

  it('errors が無い ApiError は formatErrorMessage の文言をフォーム上部に出す', async () => {
    register.mockRejectedValue(problem({ status: 500, detail: 'サーバーで問題が起きました', requestId: 'req-123' }))
    renderPage()
    await fillValid()

    await userEvent.click(screen.getByRole('button', { name: '登録する' }))

    const area = await screen.findByRole('region', { name: '登録の結果' })
    expect(area).toHaveTextContent('サーバーで問題が起きました（ID: req-123）')
    expect(screen.getByLabelText('ユーザー名')).toHaveValue('alice_01')
  })

  it('通信失敗（status 0）もフォーム上部に出す', async () => {
    register.mockRejectedValue(problem({ status: 0, detail: '通信に失敗しました' }))
    renderPage()
    await fillValid()

    await userEvent.click(screen.getByRole('button', { name: '登録する' }))

    expect(await screen.findByRole('region', { name: '登録の結果' })).toHaveTextContent('通信に失敗しました')
  })

  it('再送信すると前のサーバーの誤りを消す', async () => {
    register
      .mockRejectedValueOnce(
        problem({
          status: 409,
          errors: [{ field: 'email', message: 'このメールアドレスは登録済みです' }],
        }),
      )
      .mockResolvedValueOnce(response)
    renderPage()
    await fillValid()
    await userEvent.click(screen.getByRole('button', { name: '登録する' }))
    await screen.findByText('このメールアドレスは登録済みです')

    await userEvent.click(screen.getByRole('button', { name: '登録する' }))

    await waitFor(() => expect(signIn).toHaveBeenCalledWith(response))
    expect(screen.queryByText('このメールアドレスは登録済みです')).not.toBeInTheDocument()
  })

  it('送信中はボタンが無効で、二重に送らない', async () => {
    let resolve: (value: AuthResponse) => void = () => {}
    register.mockReturnValue(
      new Promise<AuthResponse>((r) => {
        resolve = r
      }),
    )
    renderPage()
    await fillValid()

    await userEvent.click(screen.getByRole('button', { name: '登録する' }))

    const button = screen.getByRole('button', { name: '登録する' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(register).toHaveBeenCalledTimes(1)

    resolve(response)
    await waitFor(() => expect(button).toBeEnabled())
  })

  it('ApiError 以外の例外は握りつぶさず、フォーム上部に通信失敗を出してボタンを戻す', async () => {
    register.mockRejectedValue(new TypeError('boom'))
    renderPage()
    await fillValid()

    await userEvent.click(screen.getByRole('button', { name: '登録する' }))

    expect(await screen.findByRole('region', { name: '登録の結果' })).toHaveTextContent('通信に失敗しました')
    expect(screen.getByRole('button', { name: '登録する' })).toBeEnabled()
  })
})
