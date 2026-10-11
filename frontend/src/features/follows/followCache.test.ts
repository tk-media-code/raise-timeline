import type { InfiniteData } from '@tanstack/react-query'
import { InfiniteQueryObserver, QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { Page } from '../../api/posts'
import type { UserCard, UserDetail } from '../../api/users'
import { likersKeys } from '../likes/queryKeys'
import { userKey } from '../profile/queryKeys'
import { timelineKeys } from '../posts/queryKeys'
import { searchKeys } from '../search/queryKeys'
import { forgetMissingUser, refreshAfterFollow, setFollowingInCache, type FollowTarget } from './followCache'
import { followKeys } from './queryKeys'

type Data = InfiniteData<Page<UserCard>, string | null>

function makeCard(id: string, isFollowing = false): UserCard {
  return { id, username: `user-${id}`, displayName: `名前 ${id}`, avatarUrl: null, bio: '', isFollowing }
}

function makeDetail(overrides: Partial<UserDetail> = {}): UserDetail {
  return {
    id: 'a',
    username: 'alice',
    displayName: 'アリス',
    avatarUrl: null,
    bio: '',
    isFollowing: false,
    followersCount: 5,
    followingCount: 3,
    createdAt: '2026-10-01T00:00:00Z',
    isMe: false,
    ...overrides,
  }
}

const alice: FollowTarget = { id: 'a', username: 'alice', displayName: 'アリス', isFollowing: false }

function twoPages(): Data {
  return {
    pages: [
      { items: [makeCard('a'), makeCard('b')], nextCursor: 'c2' },
      { items: [makeCard('c'), makeCard('a')], nextCursor: null },
    ],
    pageParams: [null, 'c2'],
  }
}

function flags(data: Data | undefined): boolean[][] {
  return data?.pages.map((page) => page.items.map((card) => card.isFollowing)) ?? []
}

function ids(data: Data | undefined): string[] {
  return data?.pages.flatMap((page) => page.items.map((card) => card.id)) ?? []
}

describe('setFollowingInCache', () => {
  it('true にすると、プロフィールの isFollowing が true・followersCount が 1 増え、いいねした人とフォロー一覧の全ページの同じ id の isFollowing が true になる。ほかの人は変えない', async () => {
    const client = new QueryClient()
    client.setQueryData(userKey('alice'), makeDetail())
    client.setQueryData(likersKeys.of('p1'), twoPages())
    client.setQueryData(followKeys.following('bob'), twoPages())
    client.setQueryData(followKeys.followers('carol'), twoPages())

    await setFollowingInCache(client, alice, true)

    expect(client.getQueryData<UserDetail>(userKey('alice'))).toMatchObject({ isFollowing: true, followersCount: 6, followingCount: 3 })
    for (const key of [likersKeys.of('p1'), followKeys.following('bob'), followKeys.followers('carol')]) {
      expect(flags(client.getQueryData<Data>(key))).toEqual([
        [true, false],
        [false, true],
      ])
    }
  })

  it('検索結果の全ページの同じ人のカードの isFollowing も書き換え、ほかの人は変えない（検索語が違う 2 つのキャッシュの両方）', async () => {
    const client = new QueryClient()
    client.setQueryData(searchKeys.of('ali'), twoPages())
    client.setQueryData(searchKeys.of('bo'), twoPages())

    await setFollowingInCache(client, alice, true)

    for (const key of [searchKeys.of('ali'), searchKeys.of('bo')]) {
      expect(flags(client.getQueryData<Data>(key))).toEqual([
        [true, false],
        [false, true],
      ])
    }
  })

  it('同じ値を 2 回書いても、followersCount は 1 しか増えない。false で戻る。0 未満にならない', async () => {
    const client = new QueryClient()
    client.setQueryData(userKey('alice'), makeDetail())

    await setFollowingInCache(client, alice, true)
    await setFollowingInCache(client, alice, true)
    expect(client.getQueryData<UserDetail>(userKey('alice'))).toMatchObject({ isFollowing: true, followersCount: 6 })

    await setFollowingInCache(client, alice, false)
    await setFollowingInCache(client, alice, false)
    expect(client.getQueryData<UserDetail>(userKey('alice'))).toMatchObject({ isFollowing: false, followersCount: 5 })

    client.setQueryData(userKey('alice'), makeDetail({ isFollowing: true, followersCount: 0 }))
    await setFollowingInCache(client, alice, false)
    expect(client.getQueryData<UserDetail>(userKey('alice'))).toMatchObject({ isFollowing: false, followersCount: 0 })
  })

  it('大文字のユーザー名を渡しても、小文字のキーのプロフィールを書き換える', async () => {
    const client = new QueryClient()
    client.setQueryData(userKey('alice'), makeDetail())

    await setFollowingInCache(client, { ...alice, username: 'Alice' }, true)

    expect(client.getQueryData<UserDetail>(userKey('alice'))).toMatchObject({ isFollowing: true, followersCount: 6 })
  })

  it('プロフィールのキャッシュが無ければ、作らない', async () => {
    const client = new QueryClient()

    await setFollowingInCache(client, alice, true)

    expect(client.getQueryData(userKey('alice'))).toBeUndefined()
  })

  it('一覧の次のページの読み込みの最中に書いても、そのページの到着で isFollowing が戻らない', async () => {
    const client = new QueryClient()
    client.setQueryData<Data>(followKeys.following('bob'), {
      pages: [{ items: [makeCard('a')], nextCursor: 'c2' }],
      pageParams: [null],
    })
    let aborted = false
    const observer = new InfiniteQueryObserver(client, {
      queryKey: followKeys.following('bob'),
      queryFn: ({ signal }): Promise<Page<UserCard>> => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        return new Promise(() => {})
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last: Page<UserCard>) => last.nextCursor,
      staleTime: Infinity,
    })
    const unsubscribe = observer.subscribe(() => {})
    void observer.fetchNextPage()
    await new Promise((resolve) => setTimeout(resolve, 0))

    await setFollowingInCache(client, alice, true)

    expect(aborted).toBe(true)
    expect(flags(client.getQueryData<Data>(followKeys.following('bob')))).toEqual([[true]])
    unsubscribe()
  })

  it('プロフィールの最初の読み込み中なら、読み直して最新を取る', async () => {
    const client = new QueryClient()
    let calls = 0
    const observer = new QueryObserver(client, {
      queryKey: userKey('alice'),
      queryFn: (): Promise<UserDetail> => {
        calls += 1
        return calls === 1 ? new Promise(() => {}) : Promise.resolve(makeDetail({ isFollowing: true, followersCount: 6 }))
      },
    })
    const unsubscribe = observer.subscribe(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))

    await setFollowingInCache(client, alice, true)

    await expect.poll(() => client.getQueryData<UserDetail>(userKey('alice'))?.followersCount).toBe(6)
    expect(calls).toBe(2)
    unsubscribe()
  })

  it('値が同じでも、プロフィールの読み直しの最中に書くと、その読み直しは中断され、古い値が届いても true・6 のまま', async () => {
    const client = new QueryClient()
    client.setQueryData(userKey('alice'), makeDetail())
    await setFollowingInCache(client, alice, true)
    let aborted = false
    let release: (detail: UserDetail) => void = () => {}
    const observer = new QueryObserver(client, {
      queryKey: userKey('alice'),
      // 押す前に読み始めた GET。まだ返らず、あとで古い値（false・5）で返る。
      queryFn: ({ signal }): Promise<UserDetail> => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        return new Promise((resolve) => {
          release = resolve
        })
      },
    })
    const unsubscribe = observer.subscribe(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))

    await setFollowingInCache(client, alice, true)
    release(makeDetail({ isFollowing: false, followersCount: 5 }))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(aborted).toBe(true)
    expect(client.getQueryData<UserDetail>(userKey('alice'))).toMatchObject({ isFollowing: true, followersCount: 6 })
    unsubscribe()
  })

  it('プロフィールに「無効」の印が付いていれば（読み直しが待っている）、印を外さず、値も書き換えない', async () => {
    const client = new QueryClient()
    client.setQueryData(userKey('alice'), makeDetail())
    await client.invalidateQueries({ queryKey: userKey('alice'), exact: true })

    await setFollowingInCache(client, alice, true)

    expect(client.getQueryState(userKey('alice'))?.isInvalidated).toBe(true)
    expect(client.getQueryData<UserDetail>(userKey('alice'))).toMatchObject({ isFollowing: false, followersCount: 5 })
  })

  it('一覧の最初の読み込み中なら、読み直して最新を取る', async () => {
    const client = new QueryClient()
    let calls = 0
    const observer = new InfiniteQueryObserver(client, {
      queryKey: followKeys.following('bob'),
      queryFn: (): Promise<Page<UserCard>> => {
        calls += 1
        return calls === 1 ? new Promise(() => {}) : Promise.resolve({ items: [makeCard('a', true)], nextCursor: null })
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last: Page<UserCard>) => last.nextCursor,
    })
    const unsubscribe = observer.subscribe(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))

    await setFollowingInCache(client, alice, true)

    await expect.poll(() => flags(client.getQueryData<Data>(followKeys.following('bob')))).toEqual([[true]])
    expect(calls).toBe(2)
    unsubscribe()
  })
})

describe('forgetMissingUser', () => {
  it('全一覧からその人のカードを除き、プロフィールを invalidated にする', async () => {
    const client = new QueryClient()
    client.setQueryData(userKey('alice'), makeDetail())
    client.setQueryData(likersKeys.of('p1'), twoPages())
    client.setQueryData(followKeys.followers('carol'), twoPages())

    await forgetMissingUser(client, alice)

    expect(ids(client.getQueryData<Data>(likersKeys.of('p1')))).toEqual(['b', 'c'])
    expect(ids(client.getQueryData<Data>(followKeys.followers('carol')))).toEqual(['b', 'c'])
    expect(client.getQueryState(userKey('alice'))?.isInvalidated).toBe(true)
  })

  it('検索結果からもその人のカードを除く', async () => {
    const client = new QueryClient()
    client.setQueryData(searchKeys.of('ali'), twoPages())
    client.setQueryData(searchKeys.of('bo'), twoPages())

    await forgetMissingUser(client, alice)

    expect(ids(client.getQueryData<Data>(searchKeys.of('ali')))).toEqual(['b', 'c'])
    expect(ids(client.getQueryData<Data>(searchKeys.of('bo')))).toEqual(['b', 'c'])
  })
})

describe('refreshAfterFollow', () => {
  it('開いていない 4 つ（フォロー中のタイムライン、相手のフォロワー一覧、自分のフォロー中一覧、自分のプロフィール）のキャッシュを捨て、開いている（オブザーバのある）ものと、「すべて」のタイムラインは残す', async () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.following, { pages: [], pageParams: [] })
    client.setQueryData(timelineKeys.all, { pages: [], pageParams: [] })
    client.setQueryData(followKeys.followers('alice'), twoPages())
    client.setQueryData(followKeys.following('bob'), twoPages())
    client.setQueryData(userKey('bob'), makeDetail({ id: 'b', username: 'bob' }))
    // 開いている（オブザーバがある）もの
    client.setQueryData(followKeys.following('alice'), twoPages())
    client.setQueryData(userKey('alice'), makeDetail())
    const observer = new QueryObserver(client, { queryKey: userKey('alice'), queryFn: () => makeDetail(), staleTime: Infinity })
    const unsubscribe = observer.subscribe(() => {})
    // 関係の無いもの
    client.setQueryData(followKeys.followers('carol'), twoPages())

    refreshAfterFollow(client, 'Alice', 'Bob')

    expect(client.getQueryData(timelineKeys.following)).toBeUndefined()
    expect(client.getQueryData(followKeys.followers('alice'))).toBeUndefined()
    expect(client.getQueryData(followKeys.following('bob'))).toBeUndefined()
    expect(client.getQueryData(userKey('bob'))).toBeUndefined()
    expect(client.getQueryData(timelineKeys.all)).toBeDefined()
    expect(client.getQueryData(followKeys.following('alice'))).toBeDefined()
    expect(client.getQueryData(userKey('alice'))).toBeDefined()
    expect(client.getQueryData(followKeys.followers('carol'))).toBeDefined()
    unsubscribe()
  })

  it('開いている「フォロー中のタイムライン」は残す', () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.following, { pages: [], pageParams: [] })
    const observer = new QueryObserver(client, { queryKey: timelineKeys.following, queryFn: () => ({ pages: [], pageParams: [] }), staleTime: Infinity })
    const unsubscribe = observer.subscribe(() => {})

    refreshAfterFollow(client, 'alice', 'bob')

    expect(client.getQueryData(timelineKeys.following)).toBeDefined()
    unsubscribe()
  })

  it('自分のユーザー名が分からなければ、相手側の 2 つだけ捨てる', () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.following, { pages: [], pageParams: [] })
    client.setQueryData(followKeys.followers('alice'), twoPages())
    client.setQueryData(followKeys.following('bob'), twoPages())

    refreshAfterFollow(client, 'alice', null)

    expect(client.getQueryData(timelineKeys.following)).toBeUndefined()
    expect(client.getQueryData(followKeys.followers('alice'))).toBeUndefined()
    expect(client.getQueryData(followKeys.following('bob'))).toBeDefined()
  })
})
