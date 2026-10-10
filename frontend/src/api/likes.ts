import { apiFetch } from './client'
import type { Page } from './posts'
import type { UserCard } from './users'

// どちらも冪等（付けている人がもう一度付けても、付けていない人が外しても 204）。
export function likePost(postId: string): Promise<void> {
  return apiFetch<void>(`/api/posts/${encodeURIComponent(postId)}/like`, { method: 'PUT' })
}

export function unlikePost(postId: string): Promise<void> {
  return apiFetch<void>(`/api/posts/${encodeURIComponent(postId)}/like`, { method: 'DELETE' })
}

// その投稿にいいねした人の一覧。cursor は前のページの nextCursor（最初は null）。
export function getLikers(postId: string, cursor: string | null): Promise<Page<UserCard>> {
  const query = cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`
  return apiFetch<Page<UserCard>>(`/api/posts/${encodeURIComponent(postId)}/likes${query}`)
}
