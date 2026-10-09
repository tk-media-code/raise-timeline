import { refresh, type AuthResponse } from '../api/auth'
import { ApiError } from '../api/client'
import { withAuthLock } from './authLock'
import {
  advanceSessionGeneration,
  getSessionGeneration,
  getSessionUserId,
  setAccessToken,
  setSessionUserId,
} from './tokenStore'

// 進行中の更新。同じタブでは、同じ世代の間だけ更新を 1 本にまとめる。
// リフレッシュトークンは使い捨てなので、同時に 2 本出すと片方が 401 になって
// 利用者がログアウトされてしまう（docs/auth-design.md 3 章）。
// 世代が進んだ後の呼び出しは相乗りせず、新しく更新を始める（下の refreshSession を参照）。
let inFlight: { generation: number; promise: Promise<AuthResponse | null> } | null = null

// 更新が 401 で終わったこと（セッションが死んだこと）を知りたい購読者。
// 画面の途中で API クライアントが更新に失敗したとき、React の状態を持つ AuthProvider に伝えるために使う。
// API クライアントは React の外の関数なので、状態を直接は触れない。
const expiredListeners = new Set<() => void>()

export function onSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener)
  return () => {
    expiredListeners.delete(listener)
  }
}

function notifySessionExpired(): void {
  // 呼び出し中に購読が増減しても巻き込まれないよう、複製して回す。
  for (const listener of [...expiredListeners]) listener()
}

// startedAt は更新を求められた時点のセッションの世代。
// 終わった時に世代が進んでいたら、待っている間に signIn か signOut か、他のタブからの取り直しがあったということなので、
// 結果を捨てて null を返す（トークンは書かず、消さず、購読者にも知らせない）。
// null にするのは、呼び出し側が「この更新ではログイン状態を作れなかった」と扱えば足りるため。
// 呼び出し側（AuthProvider）は、結果を始めたときの世代のままで、かつ loading の間にしか反映しないので、新しい状態は壊れない。
// 世代が進んだ後に呼ばれた refreshSession は相乗りせず自分の更新を始めるので、この null を受け取るのは、
// 世代が進む前から待っていた呼び出しだけ。apiFetch はそのとき元の 401 を投げ、次の 401 で改めて更新する。
async function doRefresh(startedAt: number): Promise<AuthResponse | null> {
  try {
    const session = await refresh()
    if (getSessionGeneration() !== startedAt) return null
    // 返った利用者が、このタブが覚えている利用者と違う。リフレッシュ Cookie は全タブで共有なので、
    // 別のタブで別の人がログインし直したということ。このまま使うと、画面は元の人なのに操作は新しい人になる。
    // 期限切れと同じ扱いにして、トークンは置かない。null を返すので、apiFetch は元の要求もやり直さない。
    // 世代も進める。飛んでいる最中の、元の人の別の要求が後から 401 を受けても、更新もやり直しもさせない
    // （世代が違えば apiFetch は更新しない）。進めないと、その要求が新しく更新を始め、
    // 利用者 id が null なので別の人を受け入れて、別の人のトークンでやり直してしまう。
    // まだ覚えていない（起動時）なら見比べる相手が無いので、そのまま受け入れる。
    const knownUserId = getSessionUserId()
    if (knownUserId !== null && knownUserId !== session.user.id) {
      advanceSessionGeneration()
      setAccessToken(null)
      setSessionUserId(null)
      notifySessionExpired()
      return null
    }
    setAccessToken(session.accessToken)
    setSessionUserId(session.user.id)
    return session
  } catch (error) {
    // 401 はリフレッシュトークンが無い・期限切れ・使用済みのどれか。ログアウト状態として扱う。
    // それ以外（500、通信失敗）はセッションが死んだとは言えないので、トークンは残して投げる。
    if (error instanceof ApiError && error.status === 401) {
      // 古い更新の 401 で、直後にログインした人のトークンを消したり、ログアウトを知らせたりしない。
      if (getSessionGeneration() !== startedAt) return null
      setAccessToken(null)
      setSessionUserId(null)
      notifySessionExpired()
      return null
    }
    throw error
  }
}

export function refreshSession(): Promise<AuthResponse | null> {
  // 世代は鍵を待つ前に控える。待っている間のログインも「古い結果」に数えるため。
  const generation = getSessionGeneration()
  // 相乗りは同じ世代の間だけ。世代が進んだ後も相乗りすると、古い世代の結果（null）を受け取って、
  // 新しい世代で必要な更新が行われない。
  // 世代の違う 2 本は、Web Locks があるとき（navigator.locks）に限り、同じタブでも鍵で順番に並ぶ。
  // 無い環境では並ばず、同時に走る。
  if (inFlight && inFlight.generation === generation) return inFlight.promise
  // タブの間は Web Locks で順番に並べる。後のタブは前のタブが受け取った新しい Cookie で成功する。
  const promise: Promise<AuthResponse | null> = withAuthLock(() => doRefresh(generation)).finally(() => {
    // 成功でも失敗でも終わったら空に戻す。戻さないと、以後の更新が古い結果を返し続ける。
    // 自分より新しい世代の更新が inFlight に入っているときは、それを消さない。
    if (inFlight?.promise === promise) inFlight = null
  })
  inFlight = { generation, promise }
  return promise
}
