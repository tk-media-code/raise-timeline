import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ApiError } from '../../api/client'
import type { Page, Post } from '../../api/posts'
import { createQueryClient } from '../../lib/queryClient'
import { TestProviders } from '../../test/providers'
import { postKey, timelineKeys } from '../posts/queryKeys'
import { likersKeys } from './queryKeys'
import { useToggleLike } from './useToggleLike'

const api = vi.hoisted(() => ({ likePost: vi.fn(), unlikePost: vi.fn() }))
vi.mock('../../api/likes', () => api)

type Data = InfiniteData<Page<Post>, string | null>
type Call = { resolve: () => void; reject: (error: unknown) => void }

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
    body: '本文',
    images: [],
    likeCount: 2,
    commentCount: 0,
    likedByMe: false,
    edited: false,
    createdAt: '2026-10-06T05:09:00Z',
    ...overrides,
  }
}

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

// 呼ばれるたびに、手で解決する Promise を 1 つ作って並べる。
function holdCalls(fn: Mock): Call[] {
  const calls: Call[] = []
  fn.mockImplementation(
    () =>
      new Promise<void>((resolve, reject) => {
        calls.push({ resolve: () => resolve(), reject })
      }),
  )
  return calls
}

describe('useToggleLike', () => {
  let client: QueryClient
  let onRemoved: Mock

  function setup(post: Post = makePost()) {
    client = createQueryClient()
    client.setQueryData<Data>(timelineKeys.all, { pages: [{ items: [post], nextCursor: null }], pageParams: [null] })
    client.setQueryData(postKey(post.id), post)
    onRemoved = vi.fn()
    function wrapper({ children }: { children: ReactNode }) {
      return <TestProviders queryClient={client}>{children}</TestProviders>
    }
    return renderHook(() => useToggleLike(post, onRemoved), { wrapper })
  }

  function listed(): Post | undefined {
    return client.getQueryData<Data>(timelineKeys.all)?.pages[0]?.items[0]
  }

  function detail(): Post | undefined {
    return client.getQueryData<Post>(postKey('p1'))
  }

  function press(toggle: () => void) {
    act(() => {
      toggle()
    })
  }

  // 押して、要求が実際に送られる（mutationFn が始まる）まで待つ。「送信中」を作るのに使う。
  // 送るのは「始まった時点で最後に押した状態」なので、始まる前に重ねて押すと、まとめて 1 回の判断になる。
  async function pressAndWaitSent(toggle: () => void, sent: Mock) {
    const before = sent.mock.calls.length
    press(toggle)
    await waitFor(() => expect(sent).toHaveBeenCalledTimes(before + 1))
  }

  // 一覧と詳細が、同じ状態になるまで待つ。
  async function expectShown(liked: boolean, count: number) {
    await waitFor(() => {
      expect(listed()).toMatchObject({ likedByMe: liked, likeCount: count })
      expect(detail()).toMatchObject({ likedByMe: liked, likeCount: count })
    })
  }

  // n 番目の要求が実際に送られる（mutationFn が始まる）のを待ってから、解決か失敗にする。
  async function settle(calls: Call[], index: number, how: 'resolve' | { reject: unknown } = 'resolve') {
    await waitFor(() => expect(calls[index]).toBeDefined())
    await act(async () => {
      if (how === 'resolve') calls[index]?.resolve()
      else calls[index]?.reject(how.reject)
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }

  beforeEach(() => {
    api.likePost.mockReset()
    api.unlikePost.mockReset()
  })

  it('押すと、要求の完了を待たずに一覧と詳細が likedByMe true・likeCount 3 になり、likePost が 1 回呼ばれる', async () => {
    const calls = holdCalls(api.likePost)
    const { result } = setup()

    press(result.current)

    await expectShown(true, 3)
    await waitFor(() => expect(api.likePost).toHaveBeenCalledTimes(1))
    expect(api.likePost).toHaveBeenCalledWith('p1')
    await settle(calls, 0)
  })

  it('送信中に 2 回押す（外す → 付ける）と、最初の要求の完了後は何も送らない（最後の状態が保存済みと同じ）', async () => {
    const calls = holdCalls(api.likePost)
    holdCalls(api.unlikePost)
    const { result } = setup()

    await pressAndWaitSent(result.current, api.likePost)
    press(result.current)
    press(result.current)
    await expectShown(true, 3)
    await settle(calls, 0)

    expect(api.likePost).toHaveBeenCalledTimes(1)
    expect(api.unlikePost).not.toHaveBeenCalled()
    await expectShown(true, 3)
  })

  it('要求が始まる前に 2 回押す（付ける → 外す）と、保存済みと同じなので何も送らない', async () => {
    holdCalls(api.likePost)
    holdCalls(api.unlikePost)
    const { result } = setup()

    press(result.current)
    press(result.current)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(api.likePost).not.toHaveBeenCalled()
    expect(api.unlikePost).not.toHaveBeenCalled()
    await expectShown(false, 2)
  })

  it('送信中に 1 回押す（外す）と、最初の要求の完了後に unlikePost を送り、false・2 に落ち着く', async () => {
    const likes = holdCalls(api.likePost)
    const unlikes = holdCalls(api.unlikePost)
    const { result } = setup()

    await pressAndWaitSent(result.current, api.likePost)
    press(result.current)
    await expectShown(false, 2)
    expect(api.unlikePost).not.toHaveBeenCalled()
    await settle(likes, 0)
    await waitFor(() => expect(api.unlikePost).toHaveBeenCalledTimes(1))
    await settle(unlikes, 0)

    expect(api.likePost).toHaveBeenCalledTimes(1)
    await expectShown(false, 2)
  })

  it('付ける要求が 500 で失敗すると、false・2 に戻り、通知が 1 つ出る。送信中に重ねて押した分は送らない', async () => {
    const likes = holdCalls(api.likePost)
    holdCalls(api.unlikePost)
    const { result } = setup()

    await pressAndWaitSent(result.current, api.likePost)
    press(result.current)
    press(result.current)
    await expectShown(true, 3)
    await settle(likes, 0, { reject: apiError({ status: 500, requestId: 'r1' }) })

    await expectShown(false, 2)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('いいねに失敗しました。もう一度お試しください（ID: r1）')
    expect(api.likePost).toHaveBeenCalledTimes(1)
    expect(api.unlikePost).not.toHaveBeenCalled()
  })

  it('付ける要求は成功し、続く外す要求が失敗すると、true・3（最後に保存できた状態）に戻り、取り消しの失敗が出る', async () => {
    const likes = holdCalls(api.likePost)
    const unlikes = holdCalls(api.unlikePost)
    const { result } = setup()

    await pressAndWaitSent(result.current, api.likePost)
    press(result.current)
    await settle(likes, 0)
    await waitFor(() => expect(api.unlikePost).toHaveBeenCalledTimes(1))
    await settle(unlikes, 0, { reject: new TypeError('Failed to fetch') })

    await expectShown(true, 3)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('いいねの取り消しに失敗しました。もう一度お試しください')
  })

  it('失敗のあとにもう一度押すと、改めて likePost を送る', async () => {
    const likes = holdCalls(api.likePost)
    const { result } = setup()
    press(result.current)
    await settle(likes, 0, { reject: apiError({ status: 500 }) })
    await expectShown(false, 2)

    press(result.current)

    await expectShown(true, 3)
    await waitFor(() => expect(api.likePost).toHaveBeenCalledTimes(2))
    await settle(likes, 1)
  })

  it('404 では「見つかりません」が出て、投稿が一覧から除かれ、onRemoved が呼ばれる', async () => {
    const likes = holdCalls(api.likePost)
    const { result } = setup()

    press(result.current)
    await settle(likes, 0, { reject: apiError({ status: 404, code: 'NOT_FOUND', detail: '見つかりません' }) })

    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('alert')).toHaveTextContent('見つかりません')
    expect(listed()).toBeUndefined()
    expect(detail()).toBeUndefined()
  })

  it('送信中に一覧のキャッシュが likedByMe false・likeCount 2 で上書きされても、要求の完了後に true・3 に書き直す', async () => {
    const likes = holdCalls(api.likePost)
    const { result } = setup()
    press(result.current)
    await expectShown(true, 3)

    act(() => {
      client.setQueryData<Data>(timelineKeys.all, {
        pages: [{ items: [makePost({ likedByMe: false, likeCount: 2 })], nextCursor: null }],
        pageParams: [null],
      })
    })
    expect(listed()).toMatchObject({ likedByMe: false, likeCount: 2 })
    await settle(likes, 0)

    await expectShown(true, 3)
  })

  it('要求が全部終わると、その投稿の likersKeys.of のキャッシュが消える。ほかの投稿のは残る', async () => {
    const likes = holdCalls(api.likePost)
    const { result } = setup()
    client.setQueryData(likersKeys.of('p1'), { pages: [], pageParams: [] })
    client.setQueryData(likersKeys.of('p2'), { pages: [], pageParams: [] })

    press(result.current)
    await waitFor(() => expect(api.likePost).toHaveBeenCalledTimes(1))
    expect(client.getQueryData(likersKeys.of('p1'))).toBeDefined()
    await settle(likes, 0)

    await waitFor(() => expect(client.getQueryData(likersKeys.of('p1'))).toBeUndefined())
    expect(client.getQueryData(likersKeys.of('p2'))).toBeDefined()
  })
})
