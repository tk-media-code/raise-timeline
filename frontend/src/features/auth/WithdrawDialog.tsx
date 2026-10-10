import { useId, useRef, useState, type FormEvent } from 'react'
import { splitFieldErrors } from '../../api/client'
import { ModalDialog } from '../../components/ModalDialog'
import { TextField } from '../../components/TextField'
import { failureMessage, isApiError } from '../posts/mutations'
import { useWithdraw } from './useWithdraw'
import { WITHDRAW_WARNING } from './withdrawText'

type WithdrawDialogProps = { open: boolean; onClose: () => void }

function isField(name: string): name is 'password' {
  return name === 'password'
}

// 退会の確認。パスワードの再入力を求める。取り消しを開いたときのフォーカスにして、
// 確認を読まずに Enter を押しても退会しないようにする（ConfirmDialog と同じ考え）。
export function WithdrawDialog({ open, onClose }: WithdrawDialogProps) {
  const titleId = useId()
  const withdraw = useWithdraw()
  // 送信中は閉じさせない。閉じても処理は続き、見えないところで退会が済んでしまう。
  // Esc と、ブラウザが自分で閉じたとき（ModalDialog の onClose）も同じ onCancel を通るので、ここで止める。
  // 背景の押下では閉じない（ほかのダイアログと同じ）。
  const cancel = () => {
    if (!withdraw.isPending) onClose()
  }
  return (
    <ModalDialog open={open} labelledBy={titleId} onCancel={cancel}>
      <h2 id={titleId} className="mb-2 text-lg font-bold">
        本当に退会しますか？
      </h2>
      <WithdrawForm pending={withdraw.isPending} mutateAsync={withdraw.mutateAsync} onCancel={cancel} />
    </ModalDialog>
  )
}

// ダイアログが開いている間だけ描かれるので、開くたびに入力も誤りも空から始まる。
function WithdrawForm({
  pending,
  mutateAsync,
  onCancel,
}: {
  pending: boolean
  mutateAsync: (password: string) => Promise<void>
  onCancel: () => void
}) {
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  // 欄に結べない誤り（429・500・通信の失敗）。ダイアログの上部に出す。
  const [formError, setFormError] = useState<string | null>(null)
  // isPending の反映は少し遅れるので、素早い 2 回目の押下は ref で止める。
  const submitting = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || submitting.current) return
    setFormError(null)
    // サーバーも空白だけは 422 にするが、送る前に断って要求を無駄にしない。
    if (password.trim() === '') {
      setPasswordError('入力してください')
      return
    }
    setPasswordError(null)
    submitting.current = true
    try {
      // 成功したあとの後始末（通知・状態を捨てる）は useWithdraw の onSuccess が行う。
      // 状態が signedOut になると、この画面ごと RequireAuth に移されるので、ここでは閉じない。
      await mutateAsync(password)
    } catch (error) {
      report(error)
    } finally {
      submitting.current = false
    }
  }

  // 入力は消さない。直して、もう一度送れるように。
  function report(error: unknown) {
    if (isApiError(error, 401) && error.code === 'INVALID_PASSWORD') {
      setPasswordError(error.detail)
    } else if (isApiError(error, 401)) {
      // UNAUTHENTICATED（更新も失敗）。本人がもういない。AuthProvider が未ログインにして、画面がログインへ移すので、何も出さない。
    } else if (isApiError(error, 422)) {
      const { fieldErrors, formMessage } = splitFieldErrors(error, isField)
      setPasswordError(fieldErrors.password ?? null)
      setFormError(formMessage)
    } else if (isApiError(error, 429)) {
      // 429 は nginx が返すので本文が Problem Details ではなく、既定の文言は「通信に失敗しました」になる。
      setFormError('しばらく待ってから再試行してください')
    } else {
      setFormError(failureMessage(error))
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      {formError && (
        <p role="alert" className="rounded-md border border-red-600 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}
      <p className="text-sm text-gray-700">{WITHDRAW_WARNING}</p>
      <TextField
        id="withdraw-password"
        label="パスワード"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(value) => {
          setPassword(value)
          setPasswordError(null)
        }}
        error={passwordError ?? undefined}
      />
      <div className="mt-2 flex justify-end gap-3">
        <button
          type="button"
          data-autofocus
          disabled={pending}
          onClick={onCancel}
          className="min-h-11 min-w-11 rounded-md border border-gray-400 bg-white px-4 text-black focus:outline-2 focus:outline-offset-2 focus:outline-sky-600 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-500"
        >
          取り消し
        </button>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 min-w-11 rounded-md bg-red-600 px-4 font-bold text-white hover:bg-red-700 focus:outline-2 focus:outline-offset-2 focus:outline-red-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
        >
          退会する
        </button>
      </div>
    </form>
  )
}
