import type { Me } from './auth'
import { apiFetch } from './client'
import type { Page, Post, UserSummary } from './posts'

// 他人にも見せる形。メールアドレスは本人（Me）にしか返らない。
export type UserDetail = Omit<Me, 'email'>
// 一覧の 1 行に出す形。isFollowing は Issue 9（フォロー）まで常に false。
export type UserCard = UserSummary & { bio: string; isFollowing: boolean }
export type ProfileInput = { displayName: string; bio: string }

export function getUser(username: string): Promise<UserDetail> {
  return apiFetch<UserDetail>(`/api/users/${encodeURIComponent(username)}`)
}

export function getUserPosts(username: string, cursor: string | null): Promise<Page<Post>> {
  const query = cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`
  return apiFetch<Page<Post>>(`/api/users/${encodeURIComponent(username)}/posts${query}`)
}

export function getMe(): Promise<Me> {
  return apiFetch<Me>('/api/users/me')
}

// 部分更新ではない。二つの項目を必ず両方送る（片方を欠くとサーバーは 422 にする）。
export function updateMe(input: ProfileInput): Promise<Me> {
  return apiFetch<Me>('/api/users/me', { method: 'PATCH', body: input })
}

// アイコンの差し替え。部品名は file。選んだ時点で送る（「保存」とは別の要求）。
export function updateAvatar(file: File): Promise<{ avatarUrl: string }> {
  const form = new FormData()
  form.append('file', file)
  return apiFetch<{ avatarUrl: string }>('/api/users/me/avatar', { method: 'PUT', body: form })
}

// 退会。パスワードの再入力を本文で送る。成功は 204（本文なし）。
// withAuthLock では包まない: 401 のあとの更新が同じ鍵を取るので、入れ子になって止まる。
export function withdraw(password: string): Promise<void> {
  return apiFetch<void>('/api/users/me', { method: 'DELETE', body: { password } })
}
