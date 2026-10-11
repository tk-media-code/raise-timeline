import { useQueryClient } from '@tanstack/react-query'
import { followUser, unfollowUser } from '../../api/follows'
import { useAuth } from '../../auth/AuthProvider'
import { useToast } from '../../components/Toast'
import { failureMessage, isApiError } from '../posts/mutations'
import { useOptimisticToggle } from '../toggle/useOptimisticToggle'
import { forgetMissingUser, refreshAfterFollow, setFollowingInCache, type FollowTarget } from './followCache'
import { followFailureMessage } from './followFailureMessage'

// フォローの付け外しを、押した瞬間に画面へ反映し、最後に押した状態に収束させる。仕組みは useOptimisticToggle（いいねと共用）。
// ここで決めるのは、フォロー固有のこと。何を送るか、どうキャッシュへ書くか、失敗をどう伝えるか。
// 返すのは、押したときに呼ぶ関数。
export function useToggleFollow(target: FollowTarget): () => void {
  const client = useQueryClient()
  const toast = useToast()
  const { user: me } = useAuth()

  return useOptimisticToggle({
    scopeId: `follow:${target.id}`,
    current: target.isFollowing,
    send: (on) => (on ? followUser(target.username) : unfollowUser(target.username)),
    write: (on) => setFollowingInCache(client, target, on),
    onFailure: async (error, attempted) => {
      if (isApiError(error, 404)) {
        toast.show(failureMessage(error), 'error')
        await forgetMissingUser(client, target)
      } else {
        toast.show(followFailureMessage(error, attempted), 'error')
      }
    },
    onIdle: () => refreshAfterFollow(client, target.username, me?.username ?? null),
  })
}
