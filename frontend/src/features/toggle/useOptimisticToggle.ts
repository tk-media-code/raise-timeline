import { useEffect, useRef } from 'react'
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useIsMounted } from '../posts/useIsMounted'

export type OptimisticToggleOptions = {
  // 同じ対象のボタンが画面に複数あっても状態を 1 つにする鍵。useMutation の scope の id にも使う（例 `like:<postId>`）
  scopeId: string
  // 同期の状態が無いときに始める値（表示中のデータの状態）
  current: boolean
  // サーバーへ送る。true なら付ける、false なら外す
  send: (on: boolean) => Promise<void>
  // 画面の状態をキャッシュへ書く。同じ値を何度書いても結果が変わらないこと
  write: (on: boolean) => Promise<void>
  // 送信の失敗。保存済みの状態に戻して write した後に呼ぶ。attempted は送ろうとした状態。clear() で捨てられた分では呼ばない
  onFailure: (error: unknown, attempted: boolean) => Promise<void>
  // 要求が全部終わり、保存済みの状態を write した後に呼ぶ。待たない。clear() で捨てられた分では呼ばない
  onIdle: () => void
  // mutateAsync の失敗ごと。画面がまだあるときだけ呼ぶ
  onRejected?: (error: unknown) => void
}

// 1 つの対象ぶんの「画面の状態」と「サーバーに保存できた状態」。
//   displayed:  画面に出している状態。押した瞬間に反転する
//   confirmed:  サーバーに最後に保存できた状態
//   generation: 失敗で並んでいる分を捨てるための世代。押した時点の世代と違う要求は送らない
//   pending:    まだ終わっていない要求の数。0 になったら状態を捨てる
//   sending:    最後に送ろうとした状態。失敗の通知の文言を決める
type ToggleSync = { displayed: boolean; confirmed: boolean; generation: number; pending: number; sending: boolean }
type Variables = { sync: ToggleSync; generation: number }

// QueryClient ごとの、scopeId → ToggleSync。同じ対象のボタンが画面に複数あっても（一覧と詳細）、状態は 1 つを共有する。
// テストは毎回新しい QueryClient を作るので、状態が持ち越されない。
const syncsByClient = new WeakMap<QueryClient, Map<string, ToggleSync>>()

function syncsOf(client: QueryClient): Map<string, ToggleSync> {
  let syncs = syncsByClient.get(client)
  if (!syncs) {
    syncs = new Map()
    syncsByClient.set(client, syncs)
  }
  return syncs
}

// その対象の要求が 1 つでも生きているか（待機中・送信中・onError / onSettled の実行中を含む）。
// QueryClient.clear()（ログアウトやセッション切れで AuthProvider が呼ぶ）は MutationCache を空にするので、
// 順番待ちの要求は二度と動かず、onSettled も来ない。すると pending が 0 に戻らず、ToggleSync がマップに残り続ける。
function hasLiveRequests(client: QueryClient, scopeId: string): boolean {
  return client.isMutating({ predicate: (mutation) => mutation.options.scope?.id === scopeId }) > 0
}

// 今も使われている ToggleSync か。マップの現役であり、かつ要求が生きていること。
// clear() のあとに押されると、ToggleSync は作り直されてマップの現役が入れ替わる。押されないまま、
// clear() の前から送信中だった要求が終わった場合は、マップに残っているが要求が生きていない。
// どちらの要求も、後始末（キャッシュへの書き込み・通知）をしてはいけない。新しいセッションのキャッシュを書き換えてしまうため。
function isCurrent(client: QueryClient, scopeId: string, sync: ToggleSync): boolean {
  return syncsOf(client).get(scopeId) === sync && hasLiveRequests(client, scopeId)
}

// 付け外し（いいね・フォローなど）を、押した瞬間に画面へ反映し、要求は 1 つずつ送って、最後に押した状態に収束させる。
// 返すのは、押したときに呼ぶ関数。何を送り、どうキャッシュへ書き、失敗をどう伝えるかは options が決める。
//
// 要求を順に送るのは useMutation の scope。前の要求の onError / onSettled が終わってから次の mutationFn が始まる。
// 送る直前に「始まった時点で最後に押した状態」を見て、保存済みと同じなら送らない（連打をまとめる）。
// 途中で失敗したら、押す直前ではなく「サーバーに最後に保存できた状態」に戻して onFailure を呼び、並んでいる分は捨てる。
//
// onMutate は使わない。書き込みを押したときに同期で始めるため（mutationFn の前に await を挟むと、2 回目の押下が古い表示を読む）。
// mutate ごとのコールバックも使わない。v5 では最後の呼び出しの分しか動かない。
// 代わりに useMutation の onError / onSettled と、mutateAsync の catch を使う。
export function useOptimisticToggle(options: OptimisticToggleOptions): () => void {
  const client = useQueryClient()
  const mounted = useIsMounted()
  const { scopeId } = options
  // options は描画のたびに作り直される。順番待ちの間や、押したあとに呼ばれる関数が、最初の描画の古い値を握らないよう、最新を読む。
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })

  const mutation = useMutation<void, unknown, Variables>({
    scope: { id: scopeId },
    mutationFn: async ({ sync, generation }) => {
      if (generation !== sync.generation) return
      const target = sync.displayed
      if (target === sync.confirmed) return
      sync.sending = target
      await latest.current.send(target)
      sync.confirmed = target
    },
    onError: async (error, { sync }) => {
      sync.generation += 1
      sync.displayed = sync.confirmed
      // 現役でない ToggleSync（clear() で捨てられた分）は、書き込みも通知もしない。
      if (!isCurrent(client, scopeId, sync)) return
      await latest.current.write(sync.confirmed)
      await latest.current.onFailure(error, sync.sending)
    },
    onSettled: async (_data, _error, { sync }) => {
      sync.pending -= 1
      if (!isCurrent(client, scopeId, sync)) {
        // 捨てられた ToggleSync がマップに残っていれば片付ける。入れ替わっていれば、新しい方には触れない。
        if (syncsOf(client).get(scopeId) === sync) syncsOf(client).delete(scopeId)
        return
      }
      if (sync.pending > 0) return
      syncsOf(client).delete(scopeId)
      // 要求の間に一覧が読み直されて古い状態が入っていても、保存済みの状態に直す。
      await latest.current.write(sync.confirmed)
      // 読み直しなどの後始末は待たない。待つと、同じ対象の次の要求が後始末の終わりまで動かない。
      latest.current.onIdle()
    },
  })

  return () => {
    const { current, write, onRejected } = latest.current
    const syncs = syncsOf(client)
    let sync = syncs.get(scopeId)
    // 要求が生きていないのに残っている ToggleSync は、clear() で順番待ちの要求が消えた名残り。捨てて、表示中のデータから作り直す。
    if (sync && !hasLiveRequests(client, scopeId)) sync = undefined
    if (!sync) {
      sync = { displayed: current, confirmed: current, generation: 0, pending: 0, sending: false }
      syncs.set(scopeId, sync)
    }
    sync.displayed = !sync.displayed
    sync.pending += 1
    void write(sync.displayed)
    mutation.mutateAsync({ sync, generation: sync.generation }).catch((error: unknown) => {
      if (mounted.current) onRejected?.(error)
    })
  }
}
