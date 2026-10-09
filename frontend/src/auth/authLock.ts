// 認証に関わる要求（更新・ログイン・登録・ログアウト）をタブの間で 1 本ずつ並べる鍵。
// リフレッシュ Cookie は同じブラウザの全タブで共有され、使い捨てなので、
// 更新の応答とログインの応答が前後して届くと、古いほうが Cookie を戻してしまう競合が起きる。
// 同じ鍵の中で送れば、後の要求は前の要求が受け取った新しい Cookie を使う。
//
// 鍵は入れ子にしない。Web Locks は再入できないので、鍵の中で更新（refreshSession）を呼ぶと、
// 自分が持っている鍵を待って止まる。鍵の中で送る要求は、更新を起こさない NO_BEARER のものだけにする。
export const AUTH_LOCK_NAME = 'auth-refresh'

export function withAuthLock<T>(task: () => Promise<T>): Promise<T> {
  // 対応していない環境ではそのまま実行する。
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(AUTH_LOCK_NAME, task)
  }
  return task()
}
