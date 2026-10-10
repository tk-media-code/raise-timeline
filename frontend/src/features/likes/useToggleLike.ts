import { useQueryClient } from '@tanstack/react-query'
import { likePost, unlikePost } from '../../api/likes'
import type { Post } from '../../api/posts'
import { useToast } from '../../components/Toast'
import { setLikedInCache } from '../posts/postCache'
import { failureMessage, forgetMissingPost, isApiError } from '../posts/mutations'
import { useOptimisticToggle } from '../toggle/useOptimisticToggle'
import { likeFailureMessage } from './likeFailureMessage'
import { likersKeys } from './queryKeys'

// いいねの付け外しを、押した瞬間に画面へ反映し、最後に押した状態に収束させる。仕組みは useOptimisticToggle（フォローと共用）。
// ここで決めるのは、いいね固有のこと。何を送るか、どうキャッシュへ書くか、失敗をどう伝えるか。
// 返すのは、押したときに呼ぶ関数。
export function useToggleLike(post: Post, onRemoved?: () => void): () => void {
  const client = useQueryClient()
  const toast = useToast()
  const postId = post.id

  return useOptimisticToggle({
    scopeId: `like:${postId}`,
    current: post.likedByMe,
    send: (on) => (on ? likePost(postId) : unlikePost(postId)),
    write: (on) => setLikedInCache(client, postId, on),
    onFailure: async (error, attempted) => {
      if (isApiError(error, 404)) {
        toast.show(failureMessage(error), 'error')
        await forgetMissingPost(client, postId)
      } else {
        toast.show(likeFailureMessage(error, attempted), 'error')
      }
    },
    onIdle: () => {
      // 開いていない一覧はデータを空に戻し（次に開いたとき、古い一覧を一瞬見せない）、開いている一覧は 1 ページ目から読み直す。
      // 詳細ではハートの隣に数のリンクがあり、送信中に「いいねした人」を開ける。removeQueries だと表示中の画面に伝わらず、
      // 取得済みの（自分がいない）一覧を出したまま止まる。
      void client.resetQueries({ queryKey: likersKeys.of(postId), exact: true })
    },
    onRejected: (error) => {
      if (isApiError(error, 404)) onRemoved?.()
    },
  })
}
