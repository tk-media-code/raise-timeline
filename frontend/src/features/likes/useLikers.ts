import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { getLikers } from '../../api/likes'
import type { Page } from '../../api/posts'
import type { UserCard } from '../../api/users'
import { likersKeys } from './queryKeys'

// その投稿にいいねした人の一覧。キーは likersKeys.of(postId) のまま使う
// （いいねの付け外しが終わると、同じキーを exact で resetQueries する。開いていない一覧は空に戻り、開いている一覧は読み直される）。
export function useLikers(postId: string) {
  return useInfiniteQuery<
    Page<UserCard>,
    Error,
    InfiniteData<Page<UserCard>, string | null>,
    ReturnType<typeof likersKeys.of>,
    string | null
  >({
    queryKey: likersKeys.of(postId),
    queryFn: ({ pageParam }) => getLikers(postId, pageParam),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
  })
}
