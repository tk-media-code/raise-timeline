import { apiFetch } from './client'

// どちらも冪等（付けている人がもう一度付けても、付けていない人が外しても 204）。
export function likePost(postId: string): Promise<void> {
  return apiFetch<void>(`/api/posts/${encodeURIComponent(postId)}/like`, { method: 'PUT' })
}

export function unlikePost(postId: string): Promise<void> {
  return apiFetch<void>(`/api/posts/${encodeURIComponent(postId)}/like`, { method: 'DELETE' })
}
