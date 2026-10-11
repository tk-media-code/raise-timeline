import { ApiError } from '../../api/client'

// 付け外しの失敗の通知に、問い合わせ用の ID を添える。500 で requestId があるときだけ付ける。
// base は呼び出し側が、送ろうとした状態に合わせて決めた固定の文言。サーバーの文言だけでは何が失敗したのか分からない
// （押してすぐ別の所を見ていることが多い）ので、サーバーの detail は使わない。
export function toggleFailureMessage(error: unknown, base: string): string {
  if (error instanceof ApiError && error.status === 500 && error.requestId) {
    return `${base}（ID: ${error.requestId}）`
  }
  return base
}
