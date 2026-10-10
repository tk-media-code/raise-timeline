import type { InfiniteData } from '@tanstack/react-query'
import { InfiniteQueryObserver, QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { Page, Post } from '../../api/posts'
import { changeCommentCountInCache, prependPost, removePost, replacePost, setLikedInCache } from './postCache'
import { postKey, timelineKeys, userPostsKeys } from './queryKeys'

type Data = InfiniteData<Page<Post>, string | null>

function makePost(id: string, body = `本文 ${id}`, username = 'alice'): Post {
  return {
    id,
    author: { id: 'u1', username, displayName: 'アリス', avatarUrl: null },
    body,
    images: [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    edited: false,
    createdAt: '2026-10-06T05:09:00Z',
  }
}

function twoPages(): Data {
  return {
    pages: [
      { items: [makePost('a'), makePost('b')], nextCursor: 'c2' },
      { items: [makePost('c'), makePost('d')], nextCursor: null },
    ],
    pageParams: [null, 'c2'],
  }
}

function ids(data: Data | undefined, page: number): string[] {
  return data?.pages[page]?.items.map((post) => post.id) ?? []
}

describe('prependPost', () => {
  it('2 ページあるうち、1 ページ目の先頭にだけ足す', async () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, twoPages())

    await prependPost(client, makePost('new'))

    const data = client.getQueryData<Data>(timelineKeys.all)
    expect(ids(data, 0)).toEqual(['new', 'a', 'b'])
    expect(ids(data, 1)).toEqual(['c', 'd'])
    expect(data?.pages[0]?.nextCursor).toBe('c2')
    expect(data?.pageParams).toEqual([null, 'c2'])
  })

  it('同じ id の投稿が既にあれば、重複せず先頭に移る', async () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, twoPages())

    await prependPost(client, makePost('c', '新しい c'))

    const data = client.getQueryData<Data>(timelineKeys.all)
    expect(ids(data, 0)).toEqual(['c', 'a', 'b'])
    expect(ids(data, 1)).toEqual(['d'])
    expect(data?.pages[0]?.items[0]?.body).toBe('新しい c')
  })

  it('キャッシュが無ければ何もしない（getQueryData は undefined のまま）', async () => {
    const client = new QueryClient()

    await prependPost(client, makePost('new'))

    expect(client.getQueryData(timelineKeys.all)).toBeUndefined()
  })
})

describe('prependPost（その人の投稿一覧）', () => {
  it('作者 Alice の投稿は、userPostsKeys.of(alice) の読み込み済みの一覧の先頭に入り、ほかの人の一覧は変わらない', async () => {
    const client = new QueryClient()
    client.setQueryData(userPostsKeys.of('alice'), twoPages())
    client.setQueryData(userPostsKeys.of('bob'), twoPages())

    await prependPost(client, makePost('new', '新しい', 'Alice'))

    const alice = client.getQueryData<Data>(userPostsKeys.of('alice'))
    expect(ids(alice, 0)).toEqual(['new', 'a', 'b'])
    expect(ids(alice, 1)).toEqual(['c', 'd'])
    expect(ids(client.getQueryData<Data>(userPostsKeys.of('bob')), 0)).toEqual(['a', 'b'])
  })

  it('ユーザー名の大文字小文字が違っても、同じ一覧に入る', () => {
    expect(userPostsKeys.of('Alice')).toEqual(userPostsKeys.of('alice'))
  })

  it('一覧が無ければ作らない', async () => {
    const client = new QueryClient()

    await prependPost(client, makePost('new'))

    expect(client.getQueryData(userPostsKeys.of('alice'))).toBeUndefined()
  })

  it('その人の一覧の次のページを読み込み中なら、その読み込みは中断される', async () => {
    const client = new QueryClient()
    client.setQueryData<Data>(userPostsKeys.of('alice'), {
      pages: [{ items: [makePost('a'), makePost('b')], nextCursor: 'c2' }],
      pageParams: [null],
    })
    let aborted = false
    const observer = new InfiniteQueryObserver(client, {
      queryKey: userPostsKeys.of('alice'),
      queryFn: ({ signal }): Promise<Page<Post>> => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        return new Promise(() => {})
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last: Page<Post>) => last.nextCursor,
      staleTime: Infinity,
    })
    const unsubscribe = observer.subscribe(() => {})
    void observer.fetchNextPage()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(client.getQueryState(userPostsKeys.of('alice'))?.fetchStatus).toBe('fetching')

    await prependPost(client, makePost('new'))

    expect(aborted).toBe(true)
    expect(ids(client.getQueryData<Data>(userPostsKeys.of('alice')), 0)).toEqual(['new', 'a', 'b'])
    unsubscribe()
  })
})

describe('replacePost', () => {
  it('2 ページ目にある投稿と postKey を置き換える', async () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, twoPages())
    client.setQueryData(postKey('c'), makePost('c'))

    await replacePost(client, makePost('c', '直した本文'))

    const data = client.getQueryData<Data>(timelineKeys.all)
    expect(data?.pages[1]?.items[0]?.body).toBe('直した本文')
    expect(data?.pages[0]?.items.map((post) => post.body)).toEqual(['本文 a', '本文 b'])
    expect(client.getQueryData<Post>(postKey('c'))?.body).toBe('直した本文')
  })

  it('timelineKeys.root の下にある、ほかの種類の一覧も置き換える', async () => {
    const client = new QueryClient()
    client.setQueryData(['timeline', 'following'], twoPages())

    await replacePost(client, makePost('a', '直した本文'))

    expect(client.getQueryData<Data>(['timeline', 'following'])?.pages[0]?.items[0]?.body).toBe('直した本文')
  })

  it('postKey のキャッシュが無ければ、作らない', async () => {
    const client = new QueryClient()

    await replacePost(client, makePost('c'))

    expect(client.getQueryData(postKey('c'))).toBeUndefined()
  })
})

describe('replacePost・removePost（その人の投稿一覧）', () => {
  it('replacePost は「すべて」とその人の一覧の両方で置き換える', async () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, twoPages())
    client.setQueryData(userPostsKeys.of('alice'), twoPages())

    await replacePost(client, makePost('c', '直した本文'))

    expect(client.getQueryData<Data>(timelineKeys.all)?.pages[1]?.items[0]?.body).toBe('直した本文')
    expect(client.getQueryData<Data>(userPostsKeys.of('alice'))?.pages[1]?.items[0]?.body).toBe('直した本文')
  })

  it('removePost は「すべて」とその人の一覧の両方から除く', async () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, twoPages())
    client.setQueryData(userPostsKeys.of('alice'), twoPages())

    await removePost(client, 'c')

    expect(ids(client.getQueryData<Data>(timelineKeys.all), 1)).toEqual(['d'])
    expect(ids(client.getQueryData<Data>(userPostsKeys.of('alice')), 1)).toEqual(['d'])
  })
})

describe('setLikedInCache', () => {
  function liking(overrides: Partial<Post> = {}): Post {
    return { ...makePost('c'), likeCount: 2, likedByMe: false, ...overrides }
  }

  function withPostC(post: Post): Data {
    return {
      pages: [
        { items: [makePost('a')], nextCursor: 'c2' },
        { items: [post, makePost('d')], nextCursor: null },
      ],
      pageParams: [null, 'c2'],
    }
  }

  it('タイムラインの全ページ、その人の投稿一覧、詳細の同じ投稿の likedByMe を変え、likeCount を 1 増やす', async () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, withPostC(liking()))
    client.setQueryData(userPostsKeys.of('alice'), withPostC(liking()))
    client.setQueryData(postKey('c'), liking())

    await setLikedInCache(client, 'c', true)

    for (const key of [timelineKeys.all, userPostsKeys.of('alice')]) {
      const post = client.getQueryData<Data>(key)?.pages[1]?.items[0]
      expect(post).toMatchObject({ id: 'c', likedByMe: true, likeCount: 3 })
    }
    expect(client.getQueryData<Post>(postKey('c'))).toMatchObject({ likedByMe: true, likeCount: 3 })
  })

  it('既に同じ状態なら何も変えない（2 回呼んでも数は 1 回分）', async () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, withPostC(liking()))

    await setLikedInCache(client, 'c', true)
    await setLikedInCache(client, 'c', true)

    expect(client.getQueryData<Data>(timelineKeys.all)?.pages[1]?.items[0]).toMatchObject({ likedByMe: true, likeCount: 3 })
  })

  it('外すと 1 減り、0 未満にはならない', async () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, withPostC(liking({ likedByMe: true, likeCount: 3 })))
    client.setQueryData(postKey('c'), liking({ likedByMe: true, likeCount: 0 }))

    await setLikedInCache(client, 'c', false)

    expect(client.getQueryData<Data>(timelineKeys.all)?.pages[1]?.items[0]).toMatchObject({ likedByMe: false, likeCount: 2 })
    expect(client.getQueryData<Post>(postKey('c'))).toMatchObject({ likedByMe: false, likeCount: 0 })
  })

  it('ほかの投稿は変えない', async () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, withPostC(liking()))
    client.setQueryData(postKey('a'), makePost('a'))

    await setLikedInCache(client, 'c', true)

    const data = client.getQueryData<Data>(timelineKeys.all)
    expect(data?.pages[0]?.items[0]).toEqual(makePost('a'))
    expect(data?.pages[1]?.items[1]).toEqual(makePost('d'))
    expect(client.getQueryData(postKey('a'))).toEqual(makePost('a'))
  })

  it('詳細のキャッシュが無ければ、作らない', async () => {
    const client = new QueryClient()

    await setLikedInCache(client, 'c', true)

    expect(client.getQueryData(postKey('c'))).toBeUndefined()
  })

  it('一覧の最初の読み込み中なら、読み直して最新を取る', async () => {
    const client = new QueryClient()
    let calls = 0
    const observer = new InfiniteQueryObserver(client, {
      queryKey: timelineKeys.all,
      queryFn: (): Promise<Page<Post>> => {
        calls += 1
        return calls === 1 ? new Promise(() => {}) : Promise.resolve({ items: [liking({ likedByMe: true, likeCount: 3 })], nextCursor: null })
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last: Page<Post>) => last.nextCursor,
    })
    const unsubscribe = observer.subscribe(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))

    await setLikedInCache(client, 'c', true)

    await expect.poll(() => client.getQueryData<Data>(timelineKeys.all)?.pages[0]?.items[0]?.likeCount).toBe(3)
    expect(calls).toBe(2)
    unsubscribe()
  })
})

describe('changeCommentCountInCache', () => {
  function counting(commentCount: number): Post {
    return { ...makePost('c'), commentCount }
  }

  function withPostC(post: Post): Data {
    return {
      pages: [
        { items: [makePost('a')], nextCursor: 'c2' },
        { items: [post, makePost('d')], nextCursor: null },
      ],
      pageParams: [null, 'c2'],
    }
  }

  it('タイムラインの全ページ、その人の投稿一覧、詳細の同じ投稿の commentCount を 1 増やす', async () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, withPostC(counting(2)))
    client.setQueryData(userPostsKeys.of('alice'), withPostC(counting(2)))
    client.setQueryData(postKey('c'), counting(2))

    await changeCommentCountInCache(client, 'c', 1)

    for (const key of [timelineKeys.all, userPostsKeys.of('alice')]) {
      expect(client.getQueryData<Data>(key)?.pages[1]?.items[0]?.commentCount).toBe(3)
    }
    expect(client.getQueryData<Post>(postKey('c'))?.commentCount).toBe(3)
  })

  it('-1 で 1 減り、0 未満にはならない', async () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, withPostC(counting(3)))
    client.setQueryData(postKey('c'), counting(0))

    await changeCommentCountInCache(client, 'c', -1)

    expect(client.getQueryData<Data>(timelineKeys.all)?.pages[1]?.items[0]?.commentCount).toBe(2)
    expect(client.getQueryData<Post>(postKey('c'))?.commentCount).toBe(0)
  })

  it('ほかの投稿は変えない', async () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, withPostC(counting(2)))
    client.setQueryData(postKey('a'), makePost('a'))

    await changeCommentCountInCache(client, 'c', 1)

    const data = client.getQueryData<Data>(timelineKeys.all)
    expect(data?.pages[0]?.items[0]).toEqual(makePost('a'))
    expect(data?.pages[1]?.items[1]).toEqual(makePost('d'))
    expect(client.getQueryData(postKey('a'))).toEqual(makePost('a'))
  })

  it('詳細のキャッシュが無ければ、作らない', async () => {
    const client = new QueryClient()

    await changeCommentCountInCache(client, 'c', 1)

    expect(client.getQueryData(postKey('c'))).toBeUndefined()
  })

  it('一覧の次のページの読み込みの最中に変えても、そのページの到着で元に戻らない', async () => {
    const client = new QueryClient()
    client.setQueryData<Data>(timelineKeys.all, {
      pages: [{ items: [counting(2)], nextCursor: 'c2' }],
      pageParams: [null],
    })
    let aborted = false
    const observer = new InfiniteQueryObserver(client, {
      queryKey: timelineKeys.all,
      queryFn: ({ signal }): Promise<Page<Post>> => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        return new Promise(() => {})
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last: Page<Post>) => last.nextCursor,
      staleTime: Infinity,
    })
    const unsubscribe = observer.subscribe(() => {})
    void observer.fetchNextPage()
    await new Promise((resolve) => setTimeout(resolve, 0))

    await changeCommentCountInCache(client, 'c', 1)

    expect(aborted).toBe(true)
    expect(client.getQueryData<Data>(timelineKeys.all)?.pages[0]?.items[0]?.commentCount).toBe(3)
    unsubscribe()
  })

  it('一覧の最初の読み込み中なら、読み直して最新を取る', async () => {
    const client = new QueryClient()
    let calls = 0
    const observer = new InfiniteQueryObserver(client, {
      queryKey: timelineKeys.all,
      queryFn: (): Promise<Page<Post>> => {
        calls += 1
        return calls === 1 ? new Promise(() => {}) : Promise.resolve({ items: [counting(3)], nextCursor: null })
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last: Page<Post>) => last.nextCursor,
    })
    const unsubscribe = observer.subscribe(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))

    await changeCommentCountInCache(client, 'c', 1)

    await expect.poll(() => client.getQueryData<Data>(timelineKeys.all)?.pages[0]?.items[0]?.commentCount).toBe(3)
    expect(calls).toBe(2)
    unsubscribe()
  })
})

describe('removePost', () => {
  it('すべてのページから除き、postKey を消す', async () => {
    const client = new QueryClient()
    client.setQueryData(timelineKeys.all, twoPages())
    client.setQueryData(postKey('c'), makePost('c'))

    await removePost(client, 'c')
    await removePost(client, 'a')

    const data = client.getQueryData<Data>(timelineKeys.all)
    expect(ids(data, 0)).toEqual(['b'])
    expect(ids(data, 1)).toEqual(['d'])
    expect(client.getQueryData(postKey('c'))).toBeUndefined()
  })
})

// 最初の読み込みの最中は、書き込む先のデータが無い。到着するページは変更の前の状態なので、読み直す。
describe('最初の読み込み中の変更', () => {
  function holdFirstLoad() {
    let release: (post: Post) => void = () => {}
    const held = new Promise<Post>((resolve) => {
      release = resolve
    })
    let calls = 0
    const queryFn = () => {
      calls += 1
      return calls === 1 ? held : Promise.resolve(makePost('a', '直した本文'))
    }
    return { queryFn, release, calls: () => calls }
  }

  it('一覧の最初の読み込み中に投稿を足すと、読み直して最新を取る', async () => {
    const client = new QueryClient()
    let calls = 0
    const observer = new InfiniteQueryObserver(client, {
      queryKey: timelineKeys.all,
      queryFn: (): Promise<Page<Post>> => {
        calls += 1
        return calls === 1 ? new Promise(() => {}) : Promise.resolve({ items: [makePost('new'), makePost('a')], nextCursor: null })
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last: Page<Post>) => last.nextCursor,
    })
    const unsubscribe = observer.subscribe(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))

    await prependPost(client, makePost('new'))

    await expect.poll(() => ids(client.getQueryData<Data>(timelineKeys.all), 0)).toEqual(['new', 'a'])
    expect(calls).toBe(2)
    unsubscribe()
  })

  it('その人の一覧の最初の読み込み中に投稿を足すと、読み直して最新を取る', async () => {
    const client = new QueryClient()
    let calls = 0
    const observer = new InfiniteQueryObserver(client, {
      queryKey: userPostsKeys.of('alice'),
      queryFn: (): Promise<Page<Post>> => {
        calls += 1
        return calls === 1 ? new Promise(() => {}) : Promise.resolve({ items: [makePost('new'), makePost('a')], nextCursor: null })
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last: Page<Post>) => last.nextCursor,
    })
    const unsubscribe = observer.subscribe(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))

    await prependPost(client, makePost('new', '新しい', 'Alice'))

    await expect.poll(() => ids(client.getQueryData<Data>(userPostsKeys.of('alice')), 0)).toEqual(['new', 'a'])
    expect(calls).toBe(2)
    unsubscribe()
  })

  it('その人の一覧の最初の読み込み中に投稿を編集すると、読み直して最新を取る', async () => {
    const client = new QueryClient()
    let calls = 0
    const observer = new InfiniteQueryObserver(client, {
      queryKey: userPostsKeys.of('alice'),
      queryFn: (): Promise<Page<Post>> => {
        calls += 1
        return calls === 1
          ? new Promise(() => {})
          : Promise.resolve({ items: [makePost('a', '直した本文')], nextCursor: null })
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last: Page<Post>) => last.nextCursor,
    })
    const unsubscribe = observer.subscribe(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))

    await replacePost(client, makePost('a', '直した本文'))

    await expect.poll(() => client.getQueryData<Data>(userPostsKeys.of('alice'))?.pages[0]?.items[0]?.body).toBe('直した本文')
    expect(calls).toBe(2)
    unsubscribe()
  })

  it('詳細の最初の読み込み中に投稿を編集すると、読み直して最新を取る', async () => {
    const client = new QueryClient()
    const { queryFn, release, calls } = holdFirstLoad()
    const observer = new QueryObserver(client, { queryKey: postKey('a'), queryFn })
    const unsubscribe = observer.subscribe(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))

    await replacePost(client, makePost('a', '直した本文'))
    release(makePost('a', '元の本文'))

    await expect.poll(() => client.getQueryData<Post>(postKey('a'))?.body).toBe('直した本文')
    expect(calls()).toBe(2)
    unsubscribe()
  })
})
