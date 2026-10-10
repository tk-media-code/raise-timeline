import { toggleFailureMessage } from '../toggle/toggleFailureMessage'

// いいねの失敗の通知。送ろうとした状態（liked）に合わせた固定の文言にして、500 のときの ID の添え方は共用の部品に任せる。
// 404 は呼び出し側が failureMessage（「見つかりません」）で扱うので、ここには来ない。
export function likeFailureMessage(error: unknown, liked: boolean): string {
  return toggleFailureMessage(
    error,
    liked ? 'いいねに失敗しました。もう一度お試しください' : 'いいねの取り消しに失敗しました。もう一度お試しください',
  )
}
