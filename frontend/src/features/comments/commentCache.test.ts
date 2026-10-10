import type { InfiniteData } from '@tanstack/react-query'
import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { Comment } from '../../api/comments'
import type { Page, Post } from '../../api/posts'
import { postKey } from '../posts/queryKeys'
import { prependComment, forgetMissingComment, removeComment } from './commentCache'
import { commentsKeys } from './queryKeys'

type Data = InfiniteData<Page<Comment>, string | null>

function makeComment(id: string, body = `本文 ${id}`): Comment {
  return {
    id,
    author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
    body,
    createdAt: '2026-10-06T05:09:00Z',
  }
}

function twoPages(): Data {
  return {
    pages: [
      { items: [makeComment('a'), makeComment('b')], nextCursor: 'c2' },
      { items: [makeComment('c'), makeComment('d')], nextCursor: null },
    ],
    pageParams: [null, 'c2'],
  }
}

function ids(data: Data | undefined, page: number): string[] {
  return data?.pages[page]?.items.map((comment) => comment.id) ?? []
}

function makePost(id: string): Post {
  return {
    id,
    author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
    body: '本文',
    images: [],
    likeCount: 0,
    commentCount: 2,
    likedByMe: false,
    edited: false,
    createdAt: '2026-10-06T05:09:00Z',
  }
}

describe('prependComment', () => {
  it('1 ページ目の先頭に足し、2 ページ目と次のカーソルは変えない', async () => {
    const client = new QueryClient()
    client.setQueryData(commentsKeys.of('p1'), twoPages())

    await prependComment(client, 'p1', makeComment('new'))

    const data = client.getQueryData<Data>(commentsKeys.of('p1'))
    expect(ids(data, 0)).toEqual(['new', 'a', 'b'])
    expect(ids(data, 1)).toEqual(['c', 'd'])
    expect(data?.pages[0]?.nextCursor).toBe('c2')
    expect(data?.pageParams).toEqual([null, 'c2'])
  })

  it('同じ id があれば先に除いてから、先頭に足す', async () => {
    const client = new QueryClient()
    client.setQueryData(commentsKeys.of('p1'), twoPages())

    await prependComment(client, 'p1', makeComment('c', '新しい c'))

    const data = client.getQueryData<Data>(commentsKeys.of('p1'))
    expect(ids(data, 0)).toEqual(['c', 'a', 'b'])
    expect(ids(data, 1)).toEqual(['d'])
    expect(data?.pages[0]?.items[0]?.body).toBe('新しい c')
  })

  it('ほかの投稿の一覧は変えない', async () => {
    const client = new QueryClient()
    client.setQueryData(commentsKeys.of('p1'), twoPages())
    client.setQueryData(commentsKeys.of('p2'), twoPages())

    await prependComment(client, 'p1', makeComment('new'))

    expect(ids(client.getQueryData<Data>(commentsKeys.of('p2')), 0)).toEqual(['a', 'b'])
  })

  it('まだ読んでいない一覧には何もしない（キャッシュを作らない）', async () => {
    const client = new QueryClient()

    await prependComment(client, 'p1', makeComment('new'))

    expect(client.getQueryData(commentsKeys.of('p1'))).toBeUndefined()
  })

  it('次のページの読み込みの最中に足しても、そのページの到着で消えない', async () => {
    const client = new QueryClient()
    client.setQueryData<Data>(commentsKeys.of('p1'), {
      pages: [{ items: [makeComment('a'), makeComment('b')], nextCursor: 'c2' }],
      pageParams: [null],
    })
    let release: (page: Page<Comment>) => void = () => {}
    let aborted = false
    const observer = new InfiniteQueryObserver(client, {
      queryKey: commentsKeys.of('p1'),
      queryFn: ({ signal }): Promise<Page<Comment>> => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        return new Promise((resolve) => {
          release = resolve
        })
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last: Page<Comment>) => last.nextCursor,
      staleTime: Infinity,
    })
    const unsubscribe = observer.subscribe(() => {})
    void observer.fetchNextPage()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(client.getQueryState(commentsKeys.of('p1'))?.fetchStatus).toBe('fetching')

    await prependComment(client, 'p1', makeComment('new'))
    release({ items: [makeComment('c')], nextCursor: null })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(aborted).toBe(true)
    expect(ids(client.getQueryData<Data>(commentsKeys.of('p1')), 0)).toContain('new')
    unsubscribe()
  })

  it('最初の読み込みの最中なら、読み直して最新を取る', async () => {
    const client = new QueryClient()
    let calls = 0
    const observer = new InfiniteQueryObserver(client, {
      queryKey: commentsKeys.of('p1'),
      queryFn: (): Promise<Page<Comment>> => {
        calls += 1
        return calls === 1 ? new Promise(() => {}) : Promise.resolve({ items: [makeComment('new'), makeComment('a')], nextCursor: null })
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last: Page<Comment>) => last.nextCursor,
    })
    const unsubscribe = observer.subscribe(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))

    await prependComment(client, 'p1', makeComment('new'))

    await expect.poll(() => ids(client.getQueryData<Data>(commentsKeys.of('p1')), 0)).toEqual(['new', 'a'])
    expect(calls).toBe(2)
    unsubscribe()
  })
})

describe('removeComment', () => {
  it('全ページからそのコメントを除く', async () => {
    const client = new QueryClient()
    client.setQueryData(commentsKeys.of('p1'), twoPages())

    await removeComment(client, 'p1', 'c')
    await removeComment(client, 'p1', 'a')

    const data = client.getQueryData<Data>(commentsKeys.of('p1'))
    expect(ids(data, 0)).toEqual(['b'])
    expect(ids(data, 1)).toEqual(['d'])
  })

  it('まだ読んでいない一覧には何もしない', async () => {
    const client = new QueryClient()

    await removeComment(client, 'p1', 'a')

    expect(client.getQueryData(commentsKeys.of('p1'))).toBeUndefined()
  })

  it('次のページの読み込みの最中に消しても、そのページの到着で戻らない', async () => {
    const client = new QueryClient()
    client.setQueryData<Data>(commentsKeys.of('p1'), {
      pages: [{ items: [makeComment('a'), makeComment('b')], nextCursor: 'c2' }],
      pageParams: [null],
    })
    let aborted = false
    const observer = new InfiniteQueryObserver(client, {
      queryKey: commentsKeys.of('p1'),
      queryFn: ({ signal }): Promise<Page<Comment>> => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        return new Promise(() => {})
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last: Page<Comment>) => last.nextCursor,
      staleTime: Infinity,
    })
    const unsubscribe = observer.subscribe(() => {})
    void observer.fetchNextPage()
    await new Promise((resolve) => setTimeout(resolve, 0))

    await removeComment(client, 'p1', 'a')

    expect(aborted).toBe(true)
    expect(ids(client.getQueryData<Data>(commentsKeys.of('p1')), 0)).toEqual(['b'])
    unsubscribe()
  })

  it('最初の読み込みの最中なら、読み直して最新を取る', async () => {
    const client = new QueryClient()
    let calls = 0
    const observer = new InfiniteQueryObserver(client, {
      queryKey: commentsKeys.of('p1'),
      queryFn: (): Promise<Page<Comment>> => {
        calls += 1
        return calls === 1 ? new Promise(() => {}) : Promise.resolve({ items: [makeComment('b')], nextCursor: null })
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last: Page<Comment>) => last.nextCursor,
    })
    const unsubscribe = observer.subscribe(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))

    await removeComment(client, 'p1', 'a')

    await expect.poll(() => ids(client.getQueryData<Data>(commentsKeys.of('p1')), 0)).toEqual(['b'])
    expect(calls).toBe(2)
    unsubscribe()
  })
})

describe('forgetMissingComment', () => {
  it('コメントを除き、投稿詳細を読み直しの対象にする（invalidated になる）', async () => {
    const client = new QueryClient()
    client.setQueryData(commentsKeys.of('p1'), twoPages())
    client.setQueryData(postKey('p1'), makePost('p1'))
    client.setQueryData(postKey('p2'), makePost('p2'))
    expect(client.getQueryState(postKey('p1'))?.isInvalidated).toBe(false)

    await forgetMissingComment(client, 'p1', 'c')

    expect(ids(client.getQueryData<Data>(commentsKeys.of('p1')), 1)).toEqual(['d'])
    expect(client.getQueryState(postKey('p1'))?.isInvalidated).toBe(true)
    expect(client.getQueryState(postKey('p2'))?.isInvalidated).toBe(false)
  })
})
