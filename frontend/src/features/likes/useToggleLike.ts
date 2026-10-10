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

// useMutation の scope と、生きている要求の判定で同じ文字列を使う。
function scopeIdOf(postId: string): string {
  return `like:${postId}`
}

function syncsOf(client: QueryClient): Map<string, LikeSync> {
  let syncs = syncsByClient.get(client)
  if (!syncs) {
    syncs = new Map()
    syncsByClient.set(client, syncs)
  }
  return syncs
}

// その投稿の要求が 1 つでも生きているか（待機中・送信中・onError / onSettled の実行中を含む）。
// QueryClient.clear()（ログアウトやセッション切れで AuthProvider が呼ぶ）は MutationCache を空にするので、
// 順番待ちの要求は二度と動かず、onSettled も来ない。すると pending が 0 に戻らず、LikeSync がマップに残り続ける。
function hasLiveRequests(client: QueryClient, postId: string): boolean {
  const scopeId = scopeIdOf(postId)
  return client.isMutating({ predicate: (mutation) => mutation.options.scope?.id === scopeId }) > 0
}

// 今も使われている LikeSync か。マップの現役であり、かつ要求が生きていること。
// clear() のあとに押されると、LikeSync は作り直されてマップの現役が入れ替わる。押されないまま、
// clear() の前から送信中だった要求が終わった場合は、マップに残っているが要求が生きていない。
// どちらの要求も、後始末（キャッシュへの書き込み・通知）をしてはいけない。新しいセッションのキャッシュを書き換えてしまうため。
function isCurrent(client: QueryClient, postId: string, sync: LikeSync): boolean {
  return syncsOf(client).get(postId) === sync && hasLiveRequests(client, postId)
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
    scope: { id: scopeIdOf(postId) },
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
      // 現役でない LikeSync（clear() で捨てられた分）は、書き込みも通知もしない。
      if (!isCurrent(client, postId, sync)) return
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
      if (!isCurrent(client, postId, sync)) {
        // 捨てられた LikeSync がマップに残っていれば片付ける。入れ替わっていれば、新しい方には触れない。
        if (syncsOf(client).get(postId) === sync) syncsOf(client).delete(postId)
        return
      }
      if (sync.pending > 0) return
      syncsOf(client).delete(postId)
      // 要求の間に一覧が読み直されて古い状態が入っていても、保存済みの状態に直す。
      await setLikedInCache(client, postId, sync.confirmed)
      // 開いていない一覧はデータを空に戻し（次に開いたとき、古い一覧を一瞬見せない）、開いている一覧は 1 ページ目から読み直す。
      // 詳細ではハートの隣に数のリンクがあり、送信中に「いいねした人」を開ける。removeQueries だと表示中の画面に伝わらず、
      // 取得済みの（自分がいない）一覧を出したまま止まる。
      // 読み直しは待たない。待つと、同じ投稿の次の要求が読み直しの終わりまで動かない。
      void client.resetQueries({ queryKey: likersKeys.of(postId), exact: true })
    },
  })

  return () => {
    const syncs = syncsOf(client)
    let sync = syncs.get(postId)
    // 要求が生きていないのに残っている LikeSync は、clear() で順番待ちの要求が消えた名残り。捨てて、表示中の投稿から作り直す。
    if (sync && !hasLiveRequests(client, postId)) sync = undefined
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
