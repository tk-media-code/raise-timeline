import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { isNotFound } from '../api/client'
import { getUser } from '../api/users'
import { InfiniteList } from '../components/InfiniteList'
import { NotFoundMessage } from '../components/NotFoundMessage'
import { RetryMessage } from '../components/RetryMessage'
import { Spinner } from '../components/Spinner'
import { USERNAME_PATTERN } from '../features/auth/validation'
import { useFollowList, type FollowListKind } from '../features/follows/useFollowList'
import { userKey } from '../features/profile/queryKeys'
import { UserCardItem } from '../features/users/UserCardItem'

const TAB_BASE = 'inline-flex min-h-11 min-w-11 items-center px-4 focus:outline-2 focus:outline-offset-2 focus:outline-sky-600'

// 一覧の名前と空のときの文。タブの並び（フォロー中、フォロワー）とは別に、kind から引く。
const LISTS: Record<FollowListKind, { label: string; empty: string }> = {
  following: { label: 'フォロー中', empty: '誰もフォローしていません' },
  followers: { label: 'フォロワー', empty: 'フォロワーはいません' },
}

// AppLayout の <main> の中に描かれるので、ここでは <main> を持たない。
export default function FollowListPage({ kind }: { kind: FollowListKind }) {
  const { username = '' } = useParams()
  // ProfilePage と同じ。規則に合わない名前は API を呼ばずに「見つかりません」にする。
  const possible = USERNAME_PATTERN.test(username)
  const profile = useQuery({ queryKey: userKey(username), queryFn: () => getUser(username), enabled: possible })
  // 一覧はプロフィールが取れてから引く。いない人で、プロフィールと一覧の 404 を 2 回出さないため。
  const list = useFollowList(kind, username, profile.isSuccess)

  if (!possible) return <NotFoundMessage />
  if (profile.isPending) return <Spinner />
  if (profile.isError) {
    if (isNotFound(profile.error)) return <NotFoundMessage />
    return <RetryMessage onRetry={() => void profile.refetch()} />
  }

  const tabs = [
    { to: `/users/${username}/following`, kind: 'following' as const },
    { to: `/users/${username}/followers`, kind: 'followers' as const },
  ]

  return (
    <div className="flex flex-col">
      {/* 上部バーに出るのは「フォロー中」「フォロワー」で、誰の一覧かは出ない。見出しは表示名のまま、どの幅でも見せる。 */}
      <h1 className="p-4 text-2xl font-bold [overflow-wrap:anywhere]">{profile.data.displayName}</h1>
      <nav aria-label="フォロー中とフォロワー" className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <Link
            key={tab.kind}
            to={tab.to}
            aria-current={tab.kind === kind ? 'page' : undefined}
            className={tab.kind === kind ? `${TAB_BASE} border-b-2 border-sky-600 font-bold` : TAB_BASE}
          >
            {LISTS[tab.kind].label}
          </Link>
        ))}
      </nav>
      <InfiniteList
        query={list}
        getKey={(user) => user.id}
        renderItem={(user) => <UserCardItem user={user} />}
        emptyMessage={LISTS[kind].empty}
        label={LISTS[kind].label}
      />
    </div>
  )
}
