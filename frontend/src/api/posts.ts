import { apiFetch } from './client'

export type UserSummary = { id: string; username: string; displayName: string; avatarUrl: string | null }
export type PostImage = { id: string; url: string }
export type Post = {
  id: string
  author: UserSummary
  body: string
  images: PostImage[]
  likeCount: number
  commentCount: number
  likedByMe: boolean
  edited: boolean
  createdAt: string
}
export type Page<T> = { items: T[]; nextCursor: string | null }

// 画像の部品（images）は、画像の Issue が足すまで送らない。
export function createPost(body: string): Promise<Post> {
  const form = new FormData()
  form.append('body', body)
  return apiFetch<Post>('/api/posts', { method: 'POST', body: form })
}

export function getPost(id: string): Promise<Post> {
  return apiFetch<Post>(`/api/posts/${encodeURIComponent(id)}`)
}

export function updatePost(id: string, body: string): Promise<Post> {
  return apiFetch<Post>(`/api/posts/${encodeURIComponent(id)}`, { method: 'PATCH', body: { body } })
}

export function deletePost(id: string): Promise<void> {
  return apiFetch<void>(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function getTimelineAll(cursor: string | null): Promise<Page<Post>> {
  const query = cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`
  return apiFetch<Page<Post>>(`/api/timeline/all${query}`)
}
