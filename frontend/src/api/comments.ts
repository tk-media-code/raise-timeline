import { apiFetch } from './client'
import type { Page, UserSummary } from './posts'

export type Comment = { id: string; author: UserSummary; body: string; createdAt: string }

// その投稿のコメント一覧（新しい順）。cursor は前のページの nextCursor（最初は null）。
export function getComments(postId: string, cursor: string | null): Promise<Page<Comment>> {
  const query = cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`
  return apiFetch<Page<Comment>>(`/api/posts/${encodeURIComponent(postId)}/comments${query}`)
}

export function createComment(postId: string, body: string): Promise<Comment> {
  return apiFetch<Comment>(`/api/posts/${encodeURIComponent(postId)}/comments`, { method: 'POST', body: { body } })
}

export function deleteComment(commentId: string): Promise<void> {
  return apiFetch<void>(`/api/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' })
}
