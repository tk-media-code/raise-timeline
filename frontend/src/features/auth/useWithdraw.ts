import { useMutation } from '@tanstack/react-query'
import { withdraw } from '../../api/users'
import { useAuth } from '../../auth/AuthProvider'
import { useToast } from '../../components/Toast'

// 退会が成功したら、この端末の状態を捨てて、通知を出す。画面の移動は書かない:
// signOutLocally で signedOut になると、RequireAuth が next を付けずに /login へ移す（ログアウトと同じ）。
// 誤りの見せ方は呼び出し側（ダイアログ）が決める。
export function useWithdraw() {
  const { signOutLocally } = useAuth()
  const toast = useToast()
  return useMutation({
    // withdraw を直接渡さない。useMutation は第 2 引数に文脈を渡すので、API 関数にまで届いてしまう。
    mutationFn: (password: string) => withdraw(password),
    onSuccess: () => {
      // 画面が離れたあとに終わっても、状態は捨てる（useMutation の onSuccess は、描画を離れても走る）。
      toast.show('退会しました')
      signOutLocally()
    },
  })
}
