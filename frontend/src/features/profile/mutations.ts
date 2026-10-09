import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Me } from '../../api/auth'
import { updateAvatar, updateMe, type ProfileInput, type UserDetail } from '../../api/users'
import { useAuth } from '../../auth/AuthProvider'
import { postKeys, timelineKeys, userPostsKeys } from '../posts/queryKeys'
import { meKey, userKey } from './queryKeys'

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
      // 詳細は postKey(id) の prefix（postKeys.root）で全部まとめて印を付ける。
      void client.invalidateQueries({ queryKey: timelineKeys.root })
      void client.invalidateQueries({ queryKey: userPostsKeys.root })
      void client.invalidateQueries({ queryKey: postKeys.root })
    },
  })
}

// アイコンの差し替えが成功したら、アイコンが出ている場所に反映する。エラーの見せ方は呼び出し側が決める。
// 入力中の表示名と自己紹介は触らない（フォームの useState にあり、アイコンは「保存」とは別の要求）。
// 成功の通知は出さない: アイコンがその場で変わるのが答え。
export function useUpdateAvatar() {
  const client = useQueryClient()
  const { updateAvatarUrl } = useAuth()
  return useMutation({
    // me は成功後にどの利用者のキャッシュを直すかを決めるために受け取る（API には渡さない）。
    mutationFn: ({ file }: { me: Me; file: File }) => updateAvatar(file),
    onSuccess: ({ avatarUrl }, { me }) => {
      // (1) ログイン中の利用者（左ナビのアイコンなど）。違う人に替わっていたら AuthProvider が捨てる。
      updateAvatarUrl(me.id, avatarUrl)
      // (2) 編集画面が読んでいる me と、自分のプロフィールのキャッシュ。あるものだけ直す
      // （無いものを作ると、一部の項目だけの不完全なキャッシュになる）。
      // me のキャッシュを書き換えるので、フォームのプレビューが変わる。入力中の値は useState に残る。
      client.setQueryData<Me>(meKey, (prev) => prev && { ...prev, avatarUrl })
      client.setQueryData<UserDetail>(userKey(me.username), (prev) => prev && { ...prev, avatarUrl })
      // (3) 投稿カードにも出る。次に見るときに取り直す（理由は useUpdateProfile）。
      void client.invalidateQueries({ queryKey: timelineKeys.root })
      void client.invalidateQueries({ queryKey: userPostsKeys.root })
      void client.invalidateQueries({ queryKey: postKeys.root })
    },
  })
}
