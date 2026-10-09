import { refresh, type AuthResponse } from '../api/auth'
import { ApiError } from '../api/client'
import { getSessionGeneration, setAccessToken } from './tokenStore'

// 進行中の更新。同じタブでは更新を 1 本にまとめる。
// リフレッシュトークンは使い捨てなので、同時に 2 本出すと片方が 401 になって
// 利用者がログアウトされてしまう（docs/auth-design.md 3 章）。
let inFlight: Promise<AuthResponse | null> | null = null

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
// 終わった時に世代が進んでいたら、待っている間に signIn か signOut があったということなので、
// 結果を捨てて null を返す（トークンは書かず、消さず、購読者にも知らせない）。
// null にするのは、呼び出し側が「この更新ではログイン状態を作れなかった」と扱えば足りるため。
// 呼び出し側（AuthProvider）は、起動時の結果を loading の間にしか反映しないので、新しい状態は壊れない。
// apiFetch が古い世代の更新に相乗りした場合も、この null を受け取る。そのときは元の 401 を投げ、
// 次の 401 で改めて更新する。
async function doRefresh(startedAt: number): Promise<AuthResponse | null> {
  try {
    const session = await refresh()
    if (getSessionGeneration() !== startedAt) return null
    setAccessToken(session.accessToken)
    return session
  } catch (error) {
    // 401 はリフレッシュトークンが無い・期限切れ・使用済みのどれか。ログアウト状態として扱う。
    // それ以外（500、通信失敗）はセッションが死んだとは言えないので、トークンは残して投げる。
    if (error instanceof ApiError && error.status === 401) {
      // 古い更新の 401 で、直後にログインした人のトークンを消したり、ログアウトを知らせたりしない。
      if (getSessionGeneration() !== startedAt) return null
      setAccessToken(null)
      notifySessionExpired()
      return null
    }
    throw error
  }
}

function runExclusively(startedAt: number): Promise<AuthResponse | null> {
  // タブの間は Web Locks で順番に並べる。後のタブは前のタブが受け取った新しい Cookie で成功する。
  // 対応していない環境ではそのまま実行する。
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('auth-refresh', () => doRefresh(startedAt))
  }
  return doRefresh(startedAt)
}

export function refreshSession(): Promise<AuthResponse | null> {
  if (!inFlight) {
    // 成功でも失敗でも終わったら空に戻す。戻さないと、以後の更新が古い結果を返し続ける。
    // 世代は鍵を待つ前に控える。待っている間のログインも「古い結果」に数えるため。
    inFlight = runExclusively(getSessionGeneration()).finally(() => {
      inFlight = null
    })
  }
  return inFlight
}
