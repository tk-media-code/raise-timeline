import type { Me } from './auth'
import { apiFetch } from './client'
import type { Page, Post } from './posts'

// 他人にも見せる形。メールアドレスは本人（Me）にしか返らない。
export type UserDetail = Omit<Me, 'email'>
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
