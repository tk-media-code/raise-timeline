import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import type { Comment } from '../../api/comments'
import { useAuth } from '../../auth/AuthProvider'
import { Avatar } from '../../components/Avatar'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useToast } from '../../components/Toast'
import { formatAbsoluteTime, formatRelativeTime } from '../posts/formatTime'
import { failureMessage, isApiError } from '../posts/mutations'
import { PostBody } from '../posts/PostBody'
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
  const { author } = comment
  const isMine = user?.id === author.id

  async function confirmDelete() {
    setConfirming(false)
    if (deleting.current) return
    deleting.current = true
    try {
      await remove.mutateAsync(comment.id)
      toast.show('コメントを削除しました')
    } catch (error) {
      toast.show(failureMessage(error), 'error')
      // もう無いコメントが一覧に残ると、押すたびに同じ失敗をする。
      if (isApiError(error, 404)) await forgetMissingComment(client, postId, comment.id)
    } finally {
      deleting.current = false
    }
  }

  return (
    <article className="border-b border-gray-200 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/users/${author.username}`}
          className="flex min-h-11 min-w-11 items-center gap-2 text-black hover:underline"
        >
          <Avatar userId={author.id} displayName={author.displayName} avatarUrl={author.avatarUrl} />
          {/* 折り返すのは名前の部分だけ。リンク全体を折り返すと、長い表示名でアイコンだけが 1 行目に残る。 */}
          <span className="flex min-w-0 flex-wrap gap-x-2">
            <span className="font-bold [overflow-wrap:anywhere]">{author.displayName}</span>
            {/* 読み上げの名前が「アリス@alice」とくっつかないよう、空白を 1 つ置く（flex の中なので見た目には出ない）。 */}
            {' '}
            <span className="text-sm text-gray-600 [overflow-wrap:anywhere]">@{author.username}</span>
          </span>
        </Link>
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
          {formatRelativeTime(comment.createdAt, now ?? new Date())}
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
