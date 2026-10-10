import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { Page } from '../../api/posts'
import type { UserCard, UserDetail } from '../../api/users'
import { likersKeys } from '../likes/queryKeys'
import { hasData, reloadFirstLoads } from '../posts/postCache'
import { timelineKeys } from '../posts/queryKeys'
import { userKey } from '../profile/queryKeys'
import { followKeys } from './queryKeys'

// フォローの結果を、取り直さずにキャッシュへ直接書く。書き換えの規則（データのある読み込みは中断してから書き、
// 最初の読み込みの最中なら読み直す）は postCache.ts と同じで、理由もそちらにある。

export type FollowTarget = Pick<UserCard, 'id' | 'username' | 'displayName' | 'isFollowing'>

type CardsData = InfiniteData<Page<UserCard>, string | null>

// UserCard が載る一覧の根のキー。どれも同じ規則で扱う。ユーザー検索（Issue 10）の一覧ができたら、ここに 1 つ足す。
const LIST_ROOTS = [likersKeys.root, followKeys.root] as const

function mapCards(data: CardsData | undefined, fn: (items: UserCard[]) => UserCard[]): CardsData | undefined {
  if (!data) return data
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })) }
}

// 一覧（いいねした人・フォロワー・フォロー中。全ページ）と相手のプロフィールのキャッシュを書き換える。
// プロフィールは isFollowing と followersCount（±1）、一覧は同じ id のカードの isFollowing。
// 同じ状態を何度書いても結果が変わらない（isFollowing が同じなら何もしない。数は 0 未満にしない）ので、
// 押したとき・失敗で戻すとき・要求が全部終わったときの 3 回、どの順で呼ばれても壊れない。
// ほかの人と、キャッシュの無いプロフィールには触れない。
export async function setFollowingInCache(client: QueryClient, target: FollowTarget, following: boolean): Promise<void> {
  const profileKey = userKey(target.username)
  // プロフィールは、値が変わるときだけ中断・書き込みをする。
  // 同じ値を書くだけでも setQueryData は「無効」の印を外す。404 の失敗で読み直しの印を付けた（forgetMissingUser）あと、
  // 要求が全部終わったときの書き直し（変更なし）が印を消したり、読み直しを中断したりすると、「見つかりません」の画面にならない。
  const profileChanges = () => {
    const current = client.getQueryData<UserDetail>(profileKey)
    return current !== undefined && current.isFollowing !== following
  }
  await Promise.all([
    ...LIST_ROOTS.map((queryKey) => client.cancelQueries({ queryKey, predicate: hasData })),
    profileChanges() ? client.cancelQueries({ queryKey: profileKey, exact: true, predicate: hasData }) : undefined,
  ])
  for (const queryKey of LIST_ROOTS) {
    client.setQueriesData<CardsData>({ queryKey }, (data) =>
      mapCards(data, (items) =>
        items.map((card) => (card.id !== target.id || card.isFollowing === following ? card : { ...card, isFollowing: following })),
      ),
    )
  }
  if (profileChanges()) {
    client.setQueryData<UserDetail>(profileKey, (current) =>
      current && { ...current, isFollowing: following, followersCount: Math.max(0, current.followersCount + (following ? 1 : -1)) },
    )
  }
  await Promise.all([
    ...LIST_ROOTS.map((queryKey) => reloadFirstLoads(client, { queryKey })),
    reloadFirstLoads(client, { queryKey: profileKey, exact: true }),
  ])
}

// 404: 相手はもう退会している。この端末の一覧に残っていると、押すたびに同じ失敗をするので、カードを除く。
// プロフィールは読み直しの対象にする。開いていれば「見つかりません」の画面になる。
export async function forgetMissingUser(client: QueryClient, target: FollowTarget): Promise<void> {
  await Promise.all(LIST_ROOTS.map((queryKey) => client.cancelQueries({ queryKey, predicate: hasData })))
  for (const queryKey of LIST_ROOTS) {
    client.setQueriesData<CardsData>({ queryKey }, (data) => mapCards(data, (items) => items.filter((card) => card.id !== target.id)))
  }
  await Promise.all(LIST_ROOTS.map((queryKey) => reloadFirstLoads(client, { queryKey })))
  void client.invalidateQueries({ queryKey: userKey(target.username), exact: true })
}

// フォローの要求が全部終わったあとに、中身が変わった一覧を次に開いたとき読み直されるようにする。
// ホームの「フォロー中」、相手のフォロワー一覧、自分のフォロー中一覧、自分のプロフィールの 4 つ。
// 画面に出ている（オブザーバのある）ものは触らない。表示中の一覧を読み直すと、押したカードが消えて押し直せなくなる。
// myUsername が分からないとき（ログイン状態が失われたとき）は、相手側の 2 つだけにする。
export function refreshAfterFollow(client: QueryClient, targetUsername: string, myUsername: string | null): void {
  const keys: (readonly unknown[])[] = [timelineKeys.following, followKeys.followers(targetUsername)]
  if (myUsername !== null) keys.push(followKeys.following(myUsername), userKey(myUsername))
  for (const queryKey of keys) {
    client.removeQueries({ queryKey, exact: true, type: 'inactive' })
  }
}
