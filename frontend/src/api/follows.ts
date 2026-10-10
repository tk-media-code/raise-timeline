import { apiFetch } from './client'
import type { Page } from './posts'
import type { UserCard } from './users'

// どちらも冪等（フォローしている人がもう一度フォローしても、していない人が解除しても 204）。
export function followUser(username: string): Promise<void> {
  return apiFetch<void>(`/api/users/${encodeURIComponent(username)}/follow`, { method: 'PUT' })
}

export function unfollowUser(username: string): Promise<void> {
  return apiFetch<void>(`/api/users/${encodeURIComponent(username)}/follow`, { method: 'DELETE' })
}

// その人のフォロワー／フォロー中の一覧。cursor は前のページの nextCursor（最初は null）。
export function getFollowers(username: string, cursor: string | null): Promise<Page<UserCard>> {
  return apiFetch<Page<UserCard>>(`/api/users/${encodeURIComponent(username)}/followers${cursorQuery(cursor)}`)
}

export function getFollowing(username: string, cursor: string | null): Promise<Page<UserCard>> {
  return apiFetch<Page<UserCard>>(`/api/users/${encodeURIComponent(username)}/following${cursorQuery(cursor)}`)
}

function cursorQuery(cursor: string | null): string {
  return cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`
}
