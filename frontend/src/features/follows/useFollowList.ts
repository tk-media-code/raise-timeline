import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { getFollowers, getFollowing } from '../../api/follows'
import type { Page } from '../../api/posts'
import type { UserCard } from '../../api/users'
import { followKeys } from './queryKeys'

export type FollowListKind = 'followers' | 'following'

// その人のフォロワー／フォロー中の一覧。キーは followKeys[kind](username)（ユーザー名は小文字にそろう）。
// enabled は、プロフィールが取れてから引くためのもの（いない人で 404 を 2 回出さない）。
export function useFollowList(kind: FollowListKind, username: string, enabled: boolean) {
  return useInfiniteQuery<
    Page<UserCard>,
    Error,
    InfiniteData<Page<UserCard>, string | null>,
    ReturnType<(typeof followKeys)[FollowListKind]>,
    string | null
  >({
    queryKey: followKeys[kind](username),
    queryFn: ({ pageParam }) => (kind === 'followers' ? getFollowers(username, pageParam) : getFollowing(username, pageParam)),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  })
}
