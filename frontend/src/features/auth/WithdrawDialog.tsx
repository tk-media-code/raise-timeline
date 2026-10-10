import { useId, useRef, useState, type FormEvent } from 'react'
import { splitFieldErrors } from '../../api/client'
import { ModalDialog } from '../../components/ModalDialog'
import { TextField } from '../../components/TextField'
import { useToast } from '../../components/Toast'
import { failureMessage, isApiError } from '../posts/mutations'
import { useIsMounted } from '../posts/useIsMounted'
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
  // Esc（取り消せる cancel イベント）と「取り消し」はここで止める。背景の押下では閉じない（ほかのダイアログと同じ）。
  const cancel = () => {
    if (!withdraw.isPending) onClose()
  }
  return (
    // ブラウザがすでに閉じてしまったとき（Esc の連打、Android の戻る操作）は止められない。止めると <dialog> だけ閉じて
    // 親の open が true のまま残り、開き直せなくなる。親を閉じ、要求は続ける（mutation はここが持つので、閉じても
    // 成功の後始末は走る。失敗は WithdrawForm が通知で伝える）。
    <ModalDialog open={open} labelledBy={titleId} onCancel={cancel} onBrowserClose={onClose}>
      <h2 id={titleId} className="mb-2 text-lg font-bold">
        本当に退会しますか？
      </h2>
      <WithdrawForm pending={withdraw.isPending} mutateAsync={withdraw.mutateAsync} onCancel={cancel} />
    </ModalDialog>
  )
}

// 欄に結ばない文言。401 INVALID_PASSWORD はサーバーの固定の文言（パスワードが違います）をそのまま使う。
function rejectionMessage(error: unknown): string {
  if (isApiError(error, 401)) return error.detail
  // 429 は nginx が返すので本文が Problem Details ではなく、既定の文言は「通信に失敗しました」になる。
  if (isApiError(error, 429)) return 'しばらく待ってから再試行してください'
  if (isApiError(error, 422)) return error.errors[0]?.message ?? failureMessage(error)
  return failureMessage(error)
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
  const toast = useToast()
  const mounted = useIsMounted()

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
    // UNAUTHENTICATED（更新も失敗）。本人がもういない。AuthProvider が未ログインにして、画面がログインへ移すので、何も出さない。
    if (isApiError(error, 401) && error.code !== 'INVALID_PASSWORD') return
    // 送信中にブラウザに閉じられた（ダイアログごとこのフォームが消えた）ときは、誤りを見せる欄が無いので通知で伝える。
    if (!mounted.current) {
      toast.show(rejectionMessage(error), 'error')
      return
    }
    if (isApiError(error, 422)) {
      const { fieldErrors, formMessage } = splitFieldErrors(error, isField)
      setPasswordError(fieldErrors.password ?? null)
      setFormError(formMessage)
    } else if (isApiError(error, 401)) {
      setPasswordError(rejectionMessage(error))
    } else {
      setFormError(rejectionMessage(error))
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
