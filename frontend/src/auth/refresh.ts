import { refresh, type AuthResponse } from '../api/auth'
import { ApiError } from '../api/client'
import { setAccessToken } from './tokenStore'

// 進行中の更新。同じタブでは更新を 1 本にまとめる。
// リフレッシュトークンは使い捨てなので、同時に 2 本出すと片方が 401 になって
// 利用者がログアウトされてしまう（docs/auth-design.md 3 章）。
let inFlight: Promise<AuthResponse | null> | null = null

async function doRefresh(): Promise<AuthResponse | null> {
  try {
    const session = await refresh()
    setAccessToken(session.accessToken)
    return session
  } catch (error) {
    // 401 はリフレッシュトークンが無い・期限切れ・使用済みのどれか。ログアウト状態として扱う。
    // それ以外（500、通信失敗）はセッションが死んだとは言えないので、トークンは残して投げる。
    if (error instanceof ApiError && error.status === 401) {
      setAccessToken(null)
      return null
    }
    throw error
  }
}

function runExclusively(): Promise<AuthResponse | null> {
  // タブの間は Web Locks で順番に並べる。後のタブは前のタブが受け取った新しい Cookie で成功する。
  // 対応していない環境ではそのまま実行する。
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('auth-refresh', doRefresh)
  }
  return doRefresh()
}

export function refreshSession(): Promise<AuthResponse | null> {
  if (!inFlight) {
    // 成功でも失敗でも終わったら空に戻す。戻さないと、以後の更新が古い結果を返し続ける。
    inFlight = runExclusively().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}
