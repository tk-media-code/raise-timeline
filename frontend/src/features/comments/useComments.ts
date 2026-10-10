import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import type { Comment } from '../../api/comments'
import { getComments } from '../../api/comments'
import type { Page } from '../../api/posts'
import { commentsKeys } from './queryKeys'

// その投稿のコメント一覧（新しい順）。キーは commentsKeys.of(postId) のまま使う
// （書いた・消した結果は commentCache.ts が、このキーのキャッシュへ直接書く）。
export function useComments(postId: string) {
  return useInfiniteQuery<
    Page<Comment>,
    Error,
    InfiniteData<Page<Comment>, string | null>,
    ReturnType<typeof commentsKeys.of>,
    string | null
  >({
    queryKey: commentsKeys.of(postId),
    queryFn: ({ pageParam }) => getComments(postId, pageParam),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
  })
}
