import { InfiniteQueryObserver, QueryClientProvider, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page, Post } from '../../api/posts'
import { createQueryClient } from '../../lib/queryClient'
import { useCreatePost, useDeletePost, useUpdatePost } from './mutations'
import { postKey, timelineKeys } from './queryKeys'

const api = vi.hoisted(() => ({ createPost: vi.fn(), updatePost: vi.fn(), deletePost: vi.fn() }))
vi.mock('../../api/posts', () => api)

type Data = InfiniteData<Page<Post>, string | null>

function makePost(id: string, body = `本文 ${id}`): Post {
  return {
    id,
    author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
    body,
    images: [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    edited: false,
    createdAt: '2026-10-06T05:09:00Z',
  }
}

// 無限読み込みは、取得を始めた時点のキャッシュを土台にページを足す。
// 次のページの取得中に書いた内容が、そのページの到着で上書きされないことを確かめる。
describe('次のページを読み込んでいる最中の操作の成功', () => {
  let client: QueryClient
  let observer: InfiniteQueryObserver<Page<Post>, Error, Data, typeof timelineKeys.all, string | null>
  let unsubscribe: () => void
  let release: (page: Page<Post>) => void

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

  function allItems(): Post[] {
    return client.getQueryData<Data>(timelineKeys.all)?.pages.flatMap((page) => page.items) ?? []
  }

  beforeEach(async () => {
    api.createPost.mockReset()
    api.updatePost.mockReset()
    api.deletePost.mockReset()
    client = createQueryClient()
    const held = new Promise<Page<Post>>((resolve) => {
      release = resolve
    })
    observer = new InfiniteQueryObserver(client, {
      queryKey: timelineKeys.all,
      queryFn: ({ pageParam }) =>
        pageParam === null ? Promise.resolve({ items: [makePost('a'), makePost('b')], nextCursor: 'c2' }) : held,
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.nextCursor,
    })
    unsubscribe = observer.subscribe(() => {})
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBeDefined())
    client.setQueryData(postKey('a'), makePost('a'))
    void observer.fetchNextPage()
    await vi.waitFor(() => expect(observer.getCurrentResult().isFetchingNextPage).toBe(true))
  })

  afterEach(() => {
    unsubscribe()
  })

  async function releaseLatePage() {
    await act(async () => {
      release({ items: [makePost('c')], nextCursor: null })
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }

  it('削除した投稿は、遅れて届いたページで一覧に戻らない', async () => {
    api.deletePost.mockResolvedValue(undefined)
    const { result } = renderHook(() => useDeletePost(), { wrapper })

    await act(() => result.current.mutateAsync('a'))
    await releaseLatePage()

    expect(allItems().map((post) => post.id)).not.toContain('a')
    expect(allItems().map((post) => post.id)).toContain('b')
    expect(client.getQueryData(postKey('a'))).toBeUndefined()
  })

  it('編集した本文は、遅れて届いたページで元に戻らない', async () => {
    api.updatePost.mockResolvedValue({ ...makePost('a', '直した本文'), edited: true })
    const { result } = renderHook(() => useUpdatePost(), { wrapper })

    await act(() => result.current.mutateAsync({ id: 'a', body: '直した本文' }))
    await releaseLatePage()

    expect(allItems().find((post) => post.id === 'a')?.body).toBe('直した本文')
    expect(client.getQueryData<Post>(postKey('a'))?.body).toBe('直した本文')
  })

  it('新しい投稿は、遅れて届いたページで先頭から消えない', async () => {
    api.createPost.mockResolvedValue(makePost('new', '新しい本文'))
    const { result } = renderHook(() => useCreatePost(), { wrapper })

    await act(() => result.current.mutateAsync('新しい本文'))
    await releaseLatePage()

    expect(allItems().map((post) => post.id)[0]).toBe('new')
  })
})
