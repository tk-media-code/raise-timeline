import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { getTimelineAll, getTimelineFollowing, type Page, type Post } from '../../api/posts'
import { timelineKeys } from '../posts/queryKeys'

export type TimelineKind = 'following' | 'all'

const FETCHERS: Record<TimelineKind, (cursor: string | null) => Promise<Page<Post>>> = {
  following: getTimelineFollowing,
  all: getTimelineAll,
}

// タイムライン（「フォロー中」か「すべて」）。次のページの印（cursor）は、サーバーが返す nextCursor をそのまま使う。
// enabled が false の間は取りに行かない（まだ開いていないタブを先読みしない）。
export function useTimeline(kind: TimelineKind, enabled: boolean) {
  return useInfiniteQuery<Page<Post>, Error, InfiniteData<Page<Post>, string | null>, (typeof timelineKeys)[TimelineKind], string | null>({
    queryKey: timelineKeys[kind],
    queryFn: ({ pageParam }) => FETCHERS[kind](pageParam),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  })
}
