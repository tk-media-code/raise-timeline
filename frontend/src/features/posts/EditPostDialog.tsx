import { useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState, type FormEvent } from 'react'
import type { Post } from '../../api/posts'
import { ModalDialog } from '../../components/ModalDialog'
import { useToast } from '../../components/Toast'
import { BodyField } from './BodyField'
import { failureMessage, forgetMissingPost, isApiError, toValidationFailure, useUpdatePost } from './mutations'
import { useIsMounted } from './useIsMounted'
import { canSubmitBody } from './validation'

type EditPostDialogProps = {
  post: Post
  open: boolean
  onClose: () => void
  // 保存しようとして、投稿がもう無かったとき（404）。呼び出し側が画面を移すために使う。
  onRemoved?: () => void
}

export function EditPostDialog({ post, open, onClose, onRemoved }: EditPostDialogProps) {
  const titleId = useId()
  return (
    <ModalDialog open={open} labelledBy={titleId} onCancel={onClose}>
      <h2 id={titleId} className="mb-3 text-lg font-bold">
        投稿を編集
      </h2>
      <EditForm post={post} onClose={onClose} onRemoved={onRemoved} />
    </ModalDialog>
  )
}

// ダイアログが開いている間だけ描かれるので、開くたびに元の本文から始まる。
function EditForm({ post, onClose, onRemoved }: Pick<EditPostDialogProps, 'post' | 'onClose' | 'onRemoved'>) {
  const [body, setBody] = useState(post.body)
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const client = useQueryClient()
  const update = useUpdatePost()
  const toast = useToast()
  const submitting = useRef(false)
  const mounted = useIsMounted()

  // 元と同じ本文では保存させない。押せると、中身が同じでも「編集済み」が付いてしまう。
  const canSave = canSubmitBody(body) && body !== post.body && !update.isPending

  function change(value: string) {
    setBody(value)
    setBodyError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave || submitting.current) return
    submitting.current = true
    setBodyError(null)
    setFormError(null)
    try {
      await update.mutateAsync({ id: post.id, body })
      // 編集の成功は通知しない。ダイアログが閉じて、カードが変わるのが答え。
      // 保存中に閉じられていたら呼ばない（開き直した別のダイアログを閉じてしまう）。
      if (mounted.current) onClose()
    } catch (error) {
      const validation = toValidationFailure(error)
      if (validation && mounted.current) {
        setBodyError(validation.bodyMessage)
        setFormError(validation.formMessage)
      } else if (validation) {
        // 保存中に閉じられた。誤りを見せる欄が無いので、通知で伝える。
        toast.show(validation.bodyMessage ?? validation.formMessage ?? failureMessage(error), 'error')
      } else if (isApiError(error, 403)) {
        toast.show(failureMessage(error), 'error')
        if (mounted.current) onClose()
      } else if (isApiError(error, 404)) {
        toast.show(failureMessage(error), 'error')
        await forgetMissingPost(client, post.id)
        onRemoved?.()
        if (mounted.current) onClose()
      } else {
        // 入力は残して開いたままにする。
        toast.show(failureMessage(error), 'error')
      }
    } finally {
      submitting.current = false
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      {formError && (
        <p role="alert" className="text-sm text-red-700">
          {formError}
        </p>
      )}
      <BodyField id={`edit-post-${post.id}-body`} value={body} onChange={change} error={bodyError} focusOnMount />
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 min-w-11 rounded-md border border-gray-400 bg-white px-4 text-black focus:outline-2 focus:outline-offset-2 focus:outline-sky-600"
        >
          取り消し
        </button>
        <button
          type="submit"
          disabled={!canSave}
          className="min-h-11 min-w-11 rounded-md bg-sky-600 px-4 font-bold text-white hover:bg-sky-700 focus:outline-2 focus:outline-offset-2 focus:outline-sky-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
        >
          保存
        </button>
      </div>
    </form>
  )
}
