import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateMe, type ProfileInput } from '../../api/users'
import { useAuth } from '../../auth/AuthProvider'
import { timelineKeys, userPostsKeys } from '../posts/queryKeys'
import { userKey } from './queryKeys'

// 保存が成功したら、表示名・自己紹介が出ている場所に反映する。通知や画面の移動は呼び出し側が決める。
export function useUpdateProfile() {
  const client = useQueryClient()
  const { updateUser } = useAuth()
  return useMutation({
    // updateMe を直接渡さない。useMutation は第 2 引数に文脈を渡すので、API 関数にまで届いてしまう。
    mutationFn: (input: ProfileInput) => updateMe(input),
    onSuccess: (me) => {
      // (1) ログイン中の利用者（左ナビの表示名など）を差し替える。違う人に替わっていたら AuthProvider が捨てる。
      updateUser(me)
      // (2) 自分のプロフィールには、応答をそのまま書く。移った先で取り直しを待たせない。
      // 他人にも見える形のキャッシュなので、メールアドレスは入れない。
      const { email: _email, ...detail } = me
      client.setQueryData(userKey(me.username), detail)
      // (3) 表示名は投稿カードにも出る。タイムライン・その人の投稿一覧・投稿詳細は、次に見るときに取り直す。
      // 直接書き換えない: 投稿は無限に続く一覧の中に散らばっていて、書き換えるより取り直すほうが確実。
      // 詳細は postKey(id) の prefix（['post']）で全部まとめて印を付ける。
      void client.invalidateQueries({ queryKey: timelineKeys.root })
      void client.invalidateQueries({ queryKey: userPostsKeys.root })
      void client.invalidateQueries({ queryKey: ['post'] })
    },
  })
}
