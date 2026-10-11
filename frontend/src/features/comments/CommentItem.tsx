import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { Comment } from '../../api/comments'
import { useAuth } from '../../auth/AuthProvider'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { prepareFocusAfterRemoval } from '../../components/focusAfterRemoval'
import { useToast } from '../../components/Toast'
import { useNow } from '../../lib/useNow'
import { formatAbsoluteTime, formatRelativeTime } from '../posts/formatTime'
import { failureMessage, isApiError } from '../posts/mutations'
import { PostBody } from '../posts/PostBody'
import { UserLink } from '../users/UserLink'
import { forgetMissingComment } from './commentCache'
import { useDeleteComment } from './mutations'

type CommentItemProps = {
  comment: Comment
  postId: string
  now?: Date
}

// コメント 1 件。行を押しても移る先が無いので、カード全体は押せるようにしない。
// 本人のコメントだけ削除できる（確認ダイアログと削除の流れもここが持つ）。
export function CommentItem({ comment, postId, now }: CommentItemProps) {
  const { user } = useAuth()
  const client = useQueryClient()
  const toast = useToast()
  const remove = useDeleteComment(postId)
  const [confirming, setConfirming] = useState(false)
  const deleting = useRef(false)
  const articleRef = useRef<HTMLElement>(null)
  const currentTime = useNow()
  const { author } = comment
  const isMine = user?.id === author.id

  async function confirmDelete() {
    setConfirming(false)
    if (deleting.current) return
    deleting.current = true
    // 一覧から消えると、フォーカスも一緒に消える。消し終えたあとに近くのコメントへ移す。
    const restoreFocus = prepareFocusAfterRemoval(articleRef.current)
    try {
      await remove.mutateAsync(comment.id)
      toast.show('コメントを削除しました')
      restoreFocus()
    } catch (error) {
      toast.show(failureMessage(error), 'error')
      // もう無いコメントが一覧に残ると、押すたびに同じ失敗をする。
      if (isApiError(error, 404)) {
        await forgetMissingComment(client, postId, comment.id)
        restoreFocus()
      }
    } finally {
      deleting.current = false
    }
  }

  return (
    <article ref={articleRef} className="border-b border-gray-200 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <UserLink user={author} />
        {isMine && (
          <button
            type="button"
            aria-label="このコメントを削除"
            onClick={() => setConfirming(true)}
            className="min-h-11 min-w-11 shrink-0 rounded-md px-3 text-sm text-gray-700 hover:bg-gray-100 focus:outline-2 focus:outline-offset-2 focus:outline-sky-600"
          >
            削除
          </button>
        )}
      </div>

      <div className="text-sm text-gray-600">
        <time dateTime={comment.createdAt} title={formatAbsoluteTime(comment.createdAt)}>
          {formatRelativeTime(comment.createdAt, now ?? currentTime)}
        </time>
      </div>

      <div className="mt-1">
        <PostBody body={comment.body} />
      </div>

      {isMine && (
        <ConfirmDialog
          open={confirming}
          title="このコメントを削除しますか？"
          confirmLabel="削除"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </article>
  )
}
