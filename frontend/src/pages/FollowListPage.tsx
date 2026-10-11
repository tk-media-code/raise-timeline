import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { isNotFound } from '../api/client'
import { getUser } from '../api/users'
import { InfiniteList } from '../components/InfiniteList'
import { NotFoundMessage } from '../components/NotFoundMessage'
import { RetryMessage } from '../components/RetryMessage'
import { Spinner } from '../components/Spinner'
import { TabNav } from '../components/TabNav'
import { USERNAME_PATTERN } from '../features/auth/validation'
import { useFollowList, type FollowListKind } from '../features/follows/useFollowList'
import { userKey } from '../features/profile/queryKeys'
import { UserCardItem } from '../features/users/UserCardItem'

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

  // プロフィールを読んだあとに持ち主が退会する（タブを切り替えたときなど）と、一覧だけが 404 になる。
  // 「再試行」では直らないので「見つかりません」にする。表示中の一覧の読み直しが失敗しても、見えている一覧は消さない。
  if (list.isError && !list.data && isNotFound(list.error)) return <NotFoundMessage />

  const tabs = (['following', 'followers'] as const).map((tabKind) => ({
    to: `/users/${username}/${tabKind}`,
    label: LISTS[tabKind].label,
    current: tabKind === kind,
  }))

  return (
    <div className="flex flex-col">
      {/* 上部バーに出るのは「フォロー中」「フォロワー」で、誰の一覧かは出ない。見出しは表示名のまま、どの幅でも見せる。 */}
      <h1 className="p-4 text-2xl font-bold [overflow-wrap:anywhere]">{profile.data.displayName}</h1>
      <TabNav label="フォロー中とフォロワー" tabs={tabs} />
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
