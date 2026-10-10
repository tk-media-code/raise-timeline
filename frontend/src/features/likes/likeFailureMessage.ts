import { ApiError } from '../../api/client'

// いいねの失敗の通知。サーバーの文言だけでは何が失敗したのか分からない（押してすぐ別の所を見ていることが多い）ので、
// 送ろうとした状態（liked）に合わせた固定の文言にする。500 で requestId があるときだけ、問い合わせ用に ID を添える。
// 404 は呼び出し側が failureMessage（「見つかりません」）で扱うので、ここには来ない。
export function likeFailureMessage(error: unknown, liked: boolean): string {
  const base = liked ? 'いいねに失敗しました。もう一度お試しください' : 'いいねの取り消しに失敗しました。もう一度お試しください'
  if (error instanceof ApiError && error.status === 500 && error.requestId) {
    return `${base}（ID: ${error.requestId}）`
  }
  return base
}
