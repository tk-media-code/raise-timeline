import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { getUserPosts } from '../../api/users'
import type { Page, Post } from '../../api/posts'
import { userPostsKeys } from '../posts/queryKeys'

// その人の投稿一覧。次のページの印（cursor）は、サーバーが返す nextCursor をそのまま使う。
// enabled は、プロフィールが取れて「その人がいる」と分かってから一覧を引くために呼び出し側が渡す。
export function useUserPosts(username: string, enabled: boolean) {
  return useInfiniteQuery<
    Page<Post>,
    Error,
    InfiniteData<Page<Post>, string | null>,
    ReturnType<typeof userPostsKeys.of>,
    string | null
  >({
    queryKey: userPostsKeys.of(username),
    queryFn: ({ pageParam }) => getUserPosts(username, pageParam),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  })
}
