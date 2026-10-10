import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { Post } from '../../api/posts'
import { useAuth } from '../../auth/AuthProvider'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useToast } from '../../components/Toast'
import { useToggleLike } from '../likes/useToggleLike'
import { EditPostDialog } from './EditPostDialog'
import { failureMessage, forgetMissingPost, isApiError, useDeletePost } from './mutations'
import { PostCard } from './PostCard'

type PostItemProps = {
  post: Post
  timeStyle: 'relative' | 'absolute'
  linkToDetail: boolean
  // 投稿が画面から無くなったとき（削除できた、または 404）。詳細画面ならここで一覧へ戻す。
  onRemoved?: () => void
  // 投稿詳細で true。いいねの数を「いいねした人」へのリンクにする。
  showLikersLink?: boolean
}

// 投稿カードに、編集・削除・いいねの操作をつないだもの。自分の投稿かどうかはログイン中の利用者から決める。
export function PostItem({ post, timeStyle, linkToDetail, onRemoved, showLikersLink }: PostItemProps) {
  const { user } = useAuth()
  const client = useQueryClient()
  const toast = useToast()
  const remove = useDeletePost()
  const toggleLike = useToggleLike(post, onRemoved)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const deleting = useRef(false)
  const isMine = user?.id === post.author.id

  async function confirmDelete() {
    setConfirming(false)
    if (deleting.current) return
    deleting.current = true
    try {
      await remove.mutateAsync(post.id)
      toast.show('投稿を削除しました')
      onRemoved?.()
    } catch (error) {
      toast.show(failureMessage(error), 'error')
      if (isApiError(error, 404)) {
        await forgetMissingPost(client, post.id)
        onRemoved?.()
      }
    } finally {
      deleting.current = false
    }
  }

  return (
    <>
      <PostCard
        post={post}
        isMine={isMine}
        timeStyle={timeStyle}
        linkToDetail={linkToDetail}
        onEdit={() => setEditing(true)}
        onDelete={() => setConfirming(true)}
        onToggleLike={toggleLike}
        showLikersLink={showLikersLink}
      />
      {isMine && (
        <>
          <EditPostDialog post={post} open={editing} onClose={() => setEditing(false)} onRemoved={onRemoved} />
          <ConfirmDialog
            open={confirming}
            title="この投稿を削除しますか？"
            description="いいねとコメントも消えます"
            confirmLabel="削除"
            onConfirm={() => void confirmDelete()}
            onCancel={() => setConfirming(false)}
          />
        </>
      )}
    </>
  )
}
