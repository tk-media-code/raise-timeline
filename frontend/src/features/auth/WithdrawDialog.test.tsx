import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { renderWithProviders } from '../../test/providers'
import { WithdrawDialog } from './WithdrawDialog'

const api = vi.hoisted(() => ({ withdraw: vi.fn() }))
vi.mock('../../api/users', () => api)

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../auth/AuthProvider', () => ({ useAuth }))

const signOutLocally = vi.fn()
const onClose = vi.fn()

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
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

function openDialog() {
  const rendered = renderWithProviders(<WithdrawDialog open onClose={onClose} />)
  return { ...rendered, user: userEvent.setup() }
}

const passwordInput = () => screen.getByLabelText('パスワード')
const submitButton = () => screen.getByRole('button', { name: '退会する' })
const cancelButton = () => screen.getByRole('button', { name: '取り消し' })

function pressEsc() {
  const cancel = new Event('cancel', { cancelable: true })
  fireEvent(screen.getByRole('dialog'), cancel)
  return cancel
}

describe('WithdrawDialog', () => {
  beforeEach(() => {
    api.withdraw.mockReset()
    signOutLocally.mockReset()
    onClose.mockReset()
    useAuth.mockReturnValue({ status: 'authenticated', signOutLocally })
  })

  it('見出し「本当に退会しますか？」と説明がある', () => {
    openDialog()

    const dialog = screen.getByRole('dialog', { name: '本当に退会しますか？' })
    expect(dialog).toHaveTextContent('退会すると、投稿・コメント・いいね・フォロー・画像がすべて消え、元に戻せません。')
  })

  it('パスワードの入力欄は type=password、autocomplete=current-password、ラベルは「パスワード」', () => {
    openDialog()

    expect(passwordInput()).toHaveAttribute('type', 'password')
    expect(passwordInput()).toHaveAttribute('autocomplete', 'current-password')
  })

  it('空のまま「退会する」を押すと、入力欄の下に「入力してください」が出て、API を呼ばない', async () => {
    const { user } = openDialog()

    await user.click(submitButton())

    expect(screen.getByText('入力してください')).toBeInTheDocument()
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true')
    expect(api.withdraw).not.toHaveBeenCalled()
  })

  it('空白だけでも「入力してください」が出て、API を呼ばない', async () => {
    const { user } = openDialog()

    await user.type(passwordInput(), '   ')
    await user.click(submitButton())

    expect(screen.getByText('入力してください')).toBeInTheDocument()
    expect(api.withdraw).not.toHaveBeenCalled()
  })

  it('入力し直すと、入力欄の下の誤りは消える', async () => {
    const { user } = openDialog()
    await user.click(submitButton())
    expect(screen.getByText('入力してください')).toBeInTheDocument()

    await user.type(passwordInput(), 'a')

    expect(screen.queryByText('入力してください')).not.toBeInTheDocument()
  })

  it('パスワードが違う（401 INVALID_PASSWORD）と、入力欄の下に「パスワードが違います」が出て、ダイアログと入力が残る', async () => {
    api.withdraw.mockRejectedValue(apiError({ status: 401, code: 'INVALID_PASSWORD', detail: 'パスワードが違います' }))
    const { user } = openDialog()
    await user.type(passwordInput(), 'wrong-password-1')

    await user.click(submitButton())

    expect(await screen.findByText('パスワードが違います')).toHaveAttribute('role', 'alert')
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true')
    expect(passwordInput()).toHaveValue('wrong-password-1')
    expect(screen.getByRole('dialog', { name: '本当に退会しますか？' })).toBeInTheDocument()
    expect(signOutLocally).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    // 直して送り直せる。
    expect(submitButton()).toBeEnabled()
  })

  it('422 の password の誤りは入力欄の下に出る', async () => {
    api.withdraw.mockRejectedValue(
      apiError({
        status: 422,
        code: 'VALIDATION_ERROR',
        detail: '入力内容に誤りがあります',
        errors: [{ field: 'password', message: '入力してください' }],
      }),
    )
    const { user } = openDialog()
    await user.type(passwordInput(), 'x')

    await user.click(submitButton())

    expect(await screen.findByText('入力してください')).toHaveAttribute('role', 'alert')
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('入力内容に誤りがあります')).not.toBeInTheDocument()
  })

  it('429 なら、ダイアログの上部に「しばらく待ってから再試行してください」が出る', async () => {
    api.withdraw.mockRejectedValue(apiError({ status: 429, detail: '通信に失敗しました' }))
    const { user } = openDialog()
    await user.type(passwordInput(), 'correct-horse-1')

    await user.click(submitButton())

    const message = await screen.findByText('しばらく待ってから再試行してください')
    expect(message).toHaveAttribute('role', 'alert')
    expect(screen.queryByText('通信に失敗しました')).not.toBeInTheDocument()
    expect(passwordInput()).not.toHaveAttribute('aria-invalid')
    expect(passwordInput()).toHaveValue('correct-horse-1')
    expect(signOutLocally).not.toHaveBeenCalled()
  })

  it('500 なら、ダイアログの上部に失敗の文言（ID 付き）が出る', async () => {
    api.withdraw.mockRejectedValue(apiError({ status: 500, detail: '問題が起きました', requestId: 'req-1' }))
    const { user } = openDialog()
    await user.type(passwordInput(), 'correct-horse-1')

    await user.click(submitButton())

    expect(await screen.findByText('問題が起きました（ID: req-1）')).toHaveAttribute('role', 'alert')
    expect(passwordInput()).toHaveValue('correct-horse-1')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(signOutLocally).not.toHaveBeenCalled()
  })

  it('もう一度送ると、前の上部の誤りは消える', async () => {
    api.withdraw.mockRejectedValueOnce(apiError({ status: 429, detail: '通信に失敗しました' }))
    api.withdraw.mockReturnValueOnce(new Promise(() => {}))
    const { user } = openDialog()
    await user.type(passwordInput(), 'correct-horse-1')
    await user.click(submitButton())
    await screen.findByText('しばらく待ってから再試行してください')

    await user.click(submitButton())

    await waitFor(() => expect(api.withdraw).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('しばらく待ってから再試行してください')).not.toBeInTheDocument()
  })

  it('送信中は「取り消し」と「退会する」が押せず、Esc でも閉じない', async () => {
    api.withdraw.mockReturnValue(new Promise(() => {}))
    const { user } = openDialog()
    await user.type(passwordInput(), 'correct-horse-1')

    await user.click(submitButton())

    expect(submitButton()).toBeDisabled()
    expect(cancelButton()).toBeDisabled()
    const cancel = pressEsc()
    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
  })

  // ブラウザが利用者の操作とは別に閉じる（Esc を重ねたときの強制的な close、Android の戻る操作）。取り消せない。
  function forceClose() {
    const dialog = screen.getByRole('dialog')
    dialog.removeAttribute('open')
    fireEvent(dialog, new Event('close'))
  }

  it('送信中にブラウザがダイアログを閉じても（close イベント）、onClose が呼ばれ、要求は続く', async () => {
    const pending = deferred<undefined>()
    api.withdraw.mockReturnValue(pending.promise)
    const { user } = openDialog()
    await user.type(passwordInput(), 'correct-horse-1')
    await user.click(submitButton())

    forceClose()

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(api.withdraw).toHaveBeenCalledTimes(1)
    // 親が閉じた（open=false）あとも、成功すれば後始末は走る。
    pending.resolve(undefined)
    await waitFor(() => expect(signOutLocally).toHaveBeenCalledTimes(1))
  })

  it('送信中に閉じられたあとで成功すると、ダイアログが描かれていなくても通知と signOutLocally が行われる', async () => {
    const pending = deferred<undefined>()
    api.withdraw.mockReturnValue(pending.promise)
    function Harness() {
      const [open, setOpen] = useState(true)
      return <WithdrawDialog open={open} onClose={() => setOpen(false)} />
    }
    const user = userEvent.setup()
    renderWithProviders(<Harness />)
    await user.type(passwordInput(), 'correct-horse-1')
    await user.click(submitButton())
    forceClose()
    expect(screen.queryByLabelText('パスワード')).not.toBeInTheDocument()

    pending.resolve(undefined)

    await waitFor(() => expect(signOutLocally).toHaveBeenCalledTimes(1))
    expect(within(screen.getByRole('status', { name: '通知' })).getByText('退会しました')).toBeInTheDocument()
  })

  describe('送信中に閉じられたあとで失敗したとき（入力欄が無いので通知で伝える）', () => {
    function Harness() {
      const [open, setOpen] = useState(true)
      return <WithdrawDialog open={open} onClose={() => setOpen(false)} />
    }

    async function failAfterClose(error: ApiError | null) {
      const pending = deferred<undefined>()
      api.withdraw.mockReturnValue(pending.promise)
      const user = userEvent.setup()
      renderWithProviders(<Harness />)
      await user.type(passwordInput(), 'correct-horse-1')
      await user.click(submitButton())
      forceClose()
      // 親が閉じたので、中身（入力欄）は描かれない。
      expect(screen.queryByLabelText('パスワード')).not.toBeInTheDocument()
      pending.reject(error)
    }

    it('401 INVALID_PASSWORD は「パスワードが違います」', async () => {
      await failAfterClose(apiError({ status: 401, code: 'INVALID_PASSWORD', detail: 'パスワードが違います' }))

      expect(await screen.findByText('パスワードが違います')).toBeInTheDocument()
      expect(signOutLocally).not.toHaveBeenCalled()
    })

    it('429 は「しばらく待ってから再試行してください」', async () => {
      await failAfterClose(apiError({ status: 429, detail: '通信に失敗しました' }))

      expect(await screen.findByText('しばらく待ってから再試行してください')).toBeInTheDocument()
      expect(screen.queryByText('通信に失敗しました')).not.toBeInTheDocument()
    })

    it('500 は失敗の文言（ID 付き）', async () => {
      await failAfterClose(apiError({ status: 500, detail: '問題が起きました', requestId: 'req-1' }))

      expect(await screen.findByText('問題が起きました（ID: req-1）')).toBeInTheDocument()
    })

    it('401 UNAUTHENTICATED は何も出さない', async () => {
      await failAfterClose(apiError({ status: 401, code: 'UNAUTHENTICATED', detail: 'ログインが必要です' }))

      await waitFor(() => expect(api.withdraw).toHaveBeenCalledTimes(1))
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(screen.queryByText('ログインが必要です')).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('素早く 2 回押しても withdraw は 1 回', async () => {
    api.withdraw.mockReturnValue(new Promise(() => {}))
    const { user } = openDialog()
    await user.type(passwordInput(), 'correct-horse-1')

    await user.dblClick(submitButton())

    expect(api.withdraw).toHaveBeenCalledTimes(1)
  })

  it('送信中でなければ、Esc で閉じる', () => {
    openDialog()

    const cancel = pressEsc()

    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('送信中でなければ、「取り消し」で閉じる', async () => {
    const { user } = openDialog()

    await user.click(cancelButton())

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(api.withdraw).not.toHaveBeenCalled()
  })

  it('背景（dialog 自身）の押下では閉じない', async () => {
    const { user } = openDialog()

    await user.click(screen.getByRole('dialog'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('開いたときのフォーカスは「取り消し」にある', () => {
    openDialog()

    expect(cancelButton()).toHaveFocus()
  })

  it('成功すると withdraw に入力したパスワードが渡り、通知「退会しました」が出て、signOutLocally が呼ばれる', async () => {
    api.withdraw.mockResolvedValue(undefined)
    const { user } = openDialog()
    await user.type(passwordInput(), 'correct-horse-1')

    await user.click(submitButton())

    await waitFor(() => expect(signOutLocally).toHaveBeenCalledTimes(1))
    expect(api.withdraw).toHaveBeenCalledWith('correct-horse-1')
    expect(within(screen.getByRole('status', { name: '通知' })).getByText('退会しました')).toBeInTheDocument()
  })

  it('401 UNAUTHENTICATED（更新も失敗）なら、文言を出さず、signOutLocally も呼ばない', async () => {
    api.withdraw.mockRejectedValue(apiError({ status: 401, code: 'UNAUTHENTICATED', detail: 'ログインが必要です' }))
    const { user } = openDialog()
    await user.type(passwordInput(), 'correct-horse-1')

    await user.click(submitButton())

    await waitFor(() => expect(api.withdraw).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(submitButton()).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('ログインが必要です')).not.toBeInTheDocument()
    expect(passwordInput()).not.toHaveAttribute('aria-invalid')
    expect(signOutLocally).not.toHaveBeenCalled()
  })

  it('閉じて開き直すと、入力と誤りは空から始まる', async () => {
    api.withdraw.mockRejectedValue(apiError({ status: 401, code: 'INVALID_PASSWORD', detail: 'パスワードが違います' }))
    function Toggle() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(!open)}>
            切り替え
          </button>
          <WithdrawDialog open={open} onClose={onClose} />
        </>
      )
    }
    const user = userEvent.setup()
    renderWithProviders(<Toggle />)
    await user.type(passwordInput(), 'wrong-password-1')
    await user.click(submitButton())
    await screen.findByText('パスワードが違います')

    // モーダルが開いている間、外側は支援技術から隠れるので、hidden: true を付けて探す。
    await user.click(screen.getByRole('button', { name: '切り替え', hidden: true }))
    await user.click(screen.getByRole('button', { name: '切り替え' }))

    expect(passwordInput()).toHaveValue('')
    expect(screen.queryByText('パスワードが違います')).not.toBeInTheDocument()
  })

  it('応答が返るまでは signOutLocally を呼ばず、成功してもダイアログを閉じる指示は出さない（画面は未ログイン化で移る）', async () => {
    const pending = deferred<undefined>()
    api.withdraw.mockReturnValue(pending.promise)
    const { user } = openDialog()
    await user.type(passwordInput(), 'correct-horse-1')
    await user.click(submitButton())
    expect(signOutLocally).not.toHaveBeenCalled()

    pending.resolve(undefined)

    await waitFor(() => expect(signOutLocally).toHaveBeenCalledTimes(1))
    expect(onClose).not.toHaveBeenCalled()
  })
})
