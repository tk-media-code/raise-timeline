import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { getTimelineAll, type Page, type Post } from '../../api/posts'
import { timelineKeys } from '../posts/queryKeys'

// 「すべて」のタイムライン。次のページの印（cursor）は、サーバーが返す nextCursor をそのまま使う。
export function useTimelineAll() {
  return useInfiniteQuery<Page<Post>, Error, InfiniteData<Page<Post>, string | null>, typeof timelineKeys.all, string | null>({
    queryKey: timelineKeys.all,
    queryFn: ({ pageParam }) => getTimelineAll(pageParam),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
  })
}
