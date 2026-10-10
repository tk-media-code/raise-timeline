import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { useToast } from '../../components/Toast'
import { BodyField } from '../posts/BodyField'
import { failureMessage, forgetMissingPost, isApiError, toValidationFailure } from '../posts/mutations'
import { useIsMounted } from '../posts/useIsMounted'
import { canSubmitBody } from '../posts/validation'
import { useCreateComment } from './mutations'

type CommentFormProps = {
  postId: string
  // 書いている間に投稿が消された（404）とき。投稿詳細ならホームへ戻す。
  onPostGone: () => void
}

// 投稿へのコメントのフォーム。PostForm と同じ形（成功で入力を空にする、失敗しても入力は残す）。
// 成功の通知は出さない。送った結果は、すぐ下の一覧の先頭に見える。
export function CommentForm({ postId, onPostGone }: CommentFormProps) {
  const [body, setBody] = useState('')
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const create = useCreateComment(postId)
  const client = useQueryClient()
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
      if (isApiError(error, 404)) {
        // 投稿はもう無い。一覧から除いてから、画面を移す。
        toast.show(failureMessage(error), 'error')
        await forgetMissingPost(client, postId)
        if (mounted.current) onPostGone()
        return
      }
      const validation = toValidationFailure(error)
      if (validation && mounted.current) {
        // 入力は残す。直して、あるいはそのまま、もう一度送れるように。
        setBodyError(validation.bodyMessage)
        setFormError(validation.formMessage)
      } else if (validation) {
        // 送信中に画面を離れた。誤りを見せる欄が無いので、通知で伝える。
        toast.show(validation.bodyMessage ?? validation.formMessage ?? failureMessage(error), 'error')
      } else {
        toast.show(failureMessage(error), 'error')
      }
      return
    } finally {
      submitting.current = false
    }
    setBody('')
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3">
      {formError && (
        <p role="alert" className="text-sm text-red-700">
          {formError}
        </p>
      )}
      <BodyField
        id="comment-body"
        value={body}
        onChange={change}
        error={bodyError}
        label="コメント"
        placeholder="コメントを入力"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="min-h-11 min-w-11 shrink-0 rounded-full bg-sky-600 px-6 font-bold text-white hover:bg-sky-700 focus:outline-2 focus:outline-offset-2 focus:outline-sky-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
        >
          コメントする
        </button>
      </div>
    </form>
  )
}
