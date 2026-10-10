import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createComment, deleteComment } from '../../api/comments'
import { changeCommentCountInCache } from '../posts/postCache'
import { prependComment, removeComment } from './commentCache'

// 成功したら、結果をキャッシュへ直接書く（理由は commentCache.ts）。通知や入力欄の片付けは呼び出し側が決める。
// onSuccess が返す Promise は mutateAsync の完了前に待たれるので、書き終えてから呼び出し側の続きが動く。
// commentCount は成功のときに 1 回だけ書く（同じ状態を何度書いても同じ、とはならないため）。

// 変数は本文。
export function useCreateComment(postId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => createComment(postId, body),
    onSuccess: async (comment) => {
      await Promise.all([prependComment(client, postId, comment), changeCommentCountInCache(client, postId, 1)])
    },
  })
}

// 変数はコメント id。
export function useDeleteComment(postId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onSuccess: async (_result, commentId) => {
      await Promise.all([removeComment(client, postId, commentId), changeCommentCountInCache(client, postId, -1)])
    },
  })
}
