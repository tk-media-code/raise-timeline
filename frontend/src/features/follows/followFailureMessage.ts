import { toggleFailureMessage } from '../toggle/toggleFailureMessage'

// フォローの失敗の通知。送ろうとした状態（following）に合わせた固定の文言にして、500 のときの ID の添え方は共用の部品に任せる。
// 404 は呼び出し側が failureMessage（「見つかりません」）で扱うので、ここには来ない。
export function followFailureMessage(error: unknown, following: boolean): string {
  return toggleFailureMessage(
    error,
    following ? 'フォローに失敗しました。もう一度お試しください' : 'フォローの解除に失敗しました。もう一度お試しください',
  )
}
