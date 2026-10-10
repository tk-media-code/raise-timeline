import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { likePost, unlikePost } from '../../api/likes'
import type { Post } from '../../api/posts'
import { useToast } from '../../components/Toast'
import { setLikedInCache } from '../posts/postCache'
import { failureMessage, forgetMissingPost, isApiError } from '../posts/mutations'
import { useIsMounted } from '../posts/useIsMounted'
import { likeFailureMessage } from './likeFailureMessage'
import { likersKeys } from './queryKeys'

// 投稿 1 件ぶんの「画面の状態」と「サーバーに保存できた状態」。
//   displayed:  画面に出している状態。押した瞬間に反転する
//   confirmed:  サーバーに最後に保存できた状態
//   generation: 失敗で並んでいる分を捨てるための世代。押した時点の世代と違う要求は送らない
//   pending:    まだ終わっていない要求の数。0 になったら状態を捨てる
//   sending:    最後に送ろうとした状態。失敗の通知の文言を決める
type LikeSync = { displayed: boolean; confirmed: boolean; generation: number; pending: number; sending: boolean }
type Variables = { sync: LikeSync; generation: number }

// QueryClient ごとの、投稿 id → LikeSync。同じ投稿のボタンが画面に複数あっても（一覧と詳細）、状態は 1 つを共有する。
// テストは毎回新しい QueryClient を作るので、状態が持ち越されない。
const syncsByClient = new WeakMap<QueryClient, Map<string, LikeSync>>()

function syncsOf(client: QueryClient): Map<string, LikeSync> {
  let syncs = syncsByClient.get(client)
  if (!syncs) {
    syncs = new Map()
    syncsByClient.set(client, syncs)
  }
  return syncs
}

// いいねの付け外しを、押した瞬間に画面へ反映し、要求は 1 つずつ送って、最後に押した状態に収束させる。
// 返すのは、押したときに呼ぶ関数。
//
// 要求を順に送るのは useMutation の scope。前の要求の onError / onSettled が終わってから次の mutationFn が始まる。
// 送る直前に「始まった時点で最後に押した状態」を見て、保存済みと同じなら送らない（連打をまとめる）。
// 途中で失敗したら、押す直前ではなく「サーバーに最後に保存できた状態」に戻して通知し、並んでいる分は捨てる。
//
// onMutate は使わない。書き込みを押したときに同期で始めるため（mutationFn の前に await を挟むと、2 回目の押下が古い表示を読む）。
// mutate ごとのコールバックも使わない。v5 では最後の呼び出しの分しか動かない。
// 代わりに useMutation の onError / onSettled と、mutateAsync の catch を使う。
export function useToggleLike(post: Post, onRemoved?: () => void): () => void {
  const client = useQueryClient()
  const toast = useToast()
  const mounted = useIsMounted()
  const postId = post.id

  const mutation = useMutation<void, unknown, Variables>({
    scope: { id: `like:${postId}` },
    mutationFn: async ({ sync, generation }) => {
      if (generation !== sync.generation) return
      const target = sync.displayed
      if (target === sync.confirmed) return
      sync.sending = target
      await (target ? likePost(postId) : unlikePost(postId))
      sync.confirmed = target
    },
    onError: async (error, { sync }) => {
      sync.generation += 1
      sync.displayed = sync.confirmed
      await setLikedInCache(client, postId, sync.confirmed)
      if (isApiError(error, 404)) {
        toast.show(failureMessage(error), 'error')
        await forgetMissingPost(client, postId)
      } else {
        toast.show(likeFailureMessage(error, sync.sending), 'error')
      }
    },
    onSettled: async (_data, _error, { sync }) => {
      sync.pending -= 1
      if (sync.pending > 0) return
      syncsOf(client).delete(postId)
      // 要求の間に一覧が読み直されて古い状態が入っていても、保存済みの状態に直す。
      await setLikedInCache(client, postId, sync.confirmed)
      client.removeQueries({ queryKey: likersKeys.of(postId), exact: true })
    },
  })

  return () => {
    const syncs = syncsOf(client)
    let sync = syncs.get(postId)
    if (!sync) {
      sync = { displayed: post.likedByMe, confirmed: post.likedByMe, generation: 0, pending: 0, sending: false }
      syncs.set(postId, sync)
    }
    sync.displayed = !sync.displayed
    sync.pending += 1
    void setLikedInCache(client, postId, sync.displayed)
    mutation.mutateAsync({ sync, generation: sync.generation }).catch((error: unknown) => {
      if (isApiError(error, 404) && mounted.current) onRemoved?.()
    })
  }
}
