import { useRef, useState, type FormEvent } from 'react'
import { useToast } from '../../components/Toast'
import { BodyField } from './BodyField'
import { failureMessage, toValidationFailure, useCreatePost } from './mutations'
import { useIsMounted } from './useIsMounted'
import { canSubmitBody } from './validation'

type PostFormProps = {
  // フォームの id。入力欄は `${id}-body`。ホームの常設フォームとダイアログで別の値を渡す。
  id: string
  autoFocus?: boolean
  onPosted?: () => void
}

// 新しい投稿のフォーム。成功すると入力を空にして通知し、onPosted を呼ぶ。
export function PostForm({ id, autoFocus, onPosted }: PostFormProps) {
  const [body, setBody] = useState('')
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const create = useCreatePost()
  const toast = useToast()
  // isPending の反映は少し遅れるので、素早い 2 回目の押下は ref で止める。
  const submitting = useRef(false)
  const mounted = useIsMounted()

  const canSubmit = canSubmitBody(body, false) && !create.isPending

  function change(value: string) {
    setBody(value)
    setBodyError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || submitting.current) return
    submitting.current = true
    setBodyError(null)
    setFormError(null)
    try {
      await create.mutateAsync(body)
    } catch (error) {
      const validation = toValidationFailure(error)
      if (validation && mounted.current) {
        setBodyError(validation.bodyMessage)
        setFormError(validation.formMessage)
      } else if (validation) {
        // 送信中に閉じられた。誤りを見せる欄が無いので、通知で伝える。
        toast.show(validation.bodyMessage ?? validation.formMessage ?? failureMessage(error), 'error')
      } else {
        // 入力は残す。直して、あるいはそのまま、もう一度送れるように。
        toast.show(failureMessage(error), 'error')
      }
      return
    } finally {
      submitting.current = false
    }
    setBody('')
    toast.show('投稿しました')
    // 送信中に閉じられていたら呼ばない（開き直した別のダイアログを閉じてしまう）。
    if (mounted.current) onPosted?.()
  }

  return (
    <form id={id} onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      {formError && (
        <p role="alert" className="text-sm text-red-700">
          {formError}
        </p>
      )}
      <BodyField id={`${id}-body`} value={body} onChange={change} error={bodyError} focusOnMount={autoFocus} />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="min-h-11 min-w-11 rounded-full bg-sky-600 px-6 font-bold text-white hover:bg-sky-700 focus:outline-2 focus:outline-offset-2 focus:outline-sky-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
        >
          投稿する
        </button>
      </div>
    </form>
  )
}
