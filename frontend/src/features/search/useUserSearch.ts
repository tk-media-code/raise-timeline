import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import type { Page } from '../../api/posts'
import { searchUsers, type UserCard } from '../../api/users'
import { searchKeys } from './queryKeys'

// 語 q に当たるユーザーの一覧。enabled は、語が空でなく上限以内のときだけ引くためのもの。
// placeholderData は付けない: 語が変わったら前の語の結果はすぐ消し、どの語の結果か見分けがつかない状態を作らない。
export function useUserSearch(q: string, enabled: boolean) {
  return useInfiniteQuery<
    Page<UserCard>,
    Error,
    InfiniteData<Page<UserCard>, string | null>,
    ReturnType<typeof searchKeys.of>,
    string | null
  >({
    queryKey: searchKeys.of(q),
    queryFn: ({ pageParam }) => searchUsers(q, pageParam),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  })
}
