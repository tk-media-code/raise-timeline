import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiError, formatErrorMessage } from '../../api/client'
import { createPost, deletePost, updatePost } from '../../api/posts'
import { prependPost, removePost, replacePost } from './postCache'
import { timelineKeys } from './queryKeys'

// 成功したら、結果をキャッシュへ直接書く（理由は postCache.ts）。通知や画面の閉じ方は呼び出し側が決める。

export function useCreatePost() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => createPost(body),
    onSuccess: (post) => prependPost(client, post),
  })
}

export function useUpdatePost() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => updatePost(id, body),
    onSuccess: (post) => replacePost(client, post),
  })
}

export function useDeletePost() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePost(id),
    onSuccess: (_result, id) => removePost(client, id),
  })
}

const UNKNOWN_FAILURE = '問題が起きました。時間をおいて再試行してください'

// 通知に出す文言。ApiError なら formatErrorMessage（500 は requestId 付き）、それ以外は固定の文言。
export function failureMessage(error: unknown): string {
  return error instanceof ApiError ? formatErrorMessage(error) : UNKNOWN_FAILURE
}

export function isApiError(error: unknown, status: number): error is ApiError {
  return error instanceof ApiError && error.status === status
}

// 422 の見せ方。body の誤りは入力欄の下、それ以外はフォームの上部に出す。
export type ValidationFailure = { bodyMessage: string | null; formMessage: string | null }

export function toValidationFailure(error: unknown): ValidationFailure | null {
  if (!isApiError(error, 422)) return null
  const bodyError = error.errors.find((item) => item.field === 'body')
  return bodyError
    ? { bodyMessage: bodyError.message, formMessage: null }
    : { bodyMessage: null, formMessage: error.detail }
}

// 404: 投稿はもう無い。この端末の一覧に残っていると、押すたびに同じ失敗をするので除く。
// 一覧は取り直しも出しておく（ほかの投稿の増減が見えていない可能性があるため）。
export function forgetMissingPost(client: QueryClient, postId: string): void {
  removePost(client, postId)
  void client.invalidateQueries({ queryKey: timelineKeys.root })
}
