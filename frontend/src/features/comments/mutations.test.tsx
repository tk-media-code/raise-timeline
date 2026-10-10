import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Comment } from '../../api/comments'
import { ApiError } from '../../api/client'
import type { Page, Post } from '../../api/posts'
import { createQueryClient } from '../../lib/queryClient'
import { TestProviders } from '../../test/providers'
import { postKey } from '../posts/queryKeys'
import { useCreateComment, useDeleteComment } from './mutations'
import { commentsKeys } from './queryKeys'

const api = vi.hoisted(() => ({ getComments: vi.fn(), createComment: vi.fn(), deleteComment: vi.fn() }))
vi.mock('../../api/comments', () => api)

type Data = InfiniteData<Page<Comment>, string | null>

function makeComment(id: string, body = `本文 ${id}`): Comment {
  return {
    id,
    author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
    body,
    createdAt: '2026-10-06T05:09:00Z',
  }
}

function makePost(commentCount: number): Post {
  return {
    id: 'p1',
    author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
    body: '本文',
    images: [],
    likeCount: 0,
    commentCount,
    likedByMe: false,
    edited: false,
    createdAt: '2026-10-06T05:09:00Z',
  }
}

describe('コメントの mutation', () => {
  let client: QueryClient

  function setup<T>(hook: () => T) {
    client = createQueryClient()
    client.setQueryData<Data>(commentsKeys.of('p1'), {
      pages: [{ items: [makeComment('a'), makeComment('b')], nextCursor: null }],
      pageParams: [null],
    })
    client.setQueryData(postKey('p1'), makePost(2))
    function wrapper({ children }: { children: ReactNode }) {
      return <TestProviders queryClient={client}>{children}</TestProviders>
    }
    return renderHook(hook, { wrapper })
  }

  function listed(): string[] {
    return client.getQueryData<Data>(commentsKeys.of('p1'))?.pages[0]?.items.map((comment) => comment.id) ?? []
  }

  function count(): number | undefined {
    return client.getQueryData<Post>(postKey('p1'))?.commentCount
  }

  beforeEach(() => {
    api.createComment.mockReset()
    api.deleteComment.mockReset()
  })

  it('useCreateComment が成功すると、本文を送り、一覧の先頭に足し、詳細の commentCount が 1 増える', async () => {
    api.createComment.mockResolvedValue(makeComment('new', 'こんにちは'))
    const { result } = setup(() => useCreateComment('p1'))

    await act(() => result.current.mutateAsync('こんにちは'))

    expect(api.createComment).toHaveBeenCalledWith('p1', 'こんにちは')
    expect(listed()).toEqual(['new', 'a', 'b'])
    expect(count()).toBe(3)
  })

  it('useDeleteComment が成功すると、コメント id を送り、一覧から除き、詳細の commentCount が 1 減る', async () => {
    api.deleteComment.mockResolvedValue(undefined)
    const { result } = setup(() => useDeleteComment('p1'))

    await act(() => result.current.mutateAsync('a'))

    expect(api.deleteComment).toHaveBeenCalledWith('a')
    expect(listed()).toEqual(['b'])
    expect(count()).toBe(1)
  })

  it('書くのに失敗したときは、一覧も commentCount も変えない', async () => {
    api.createComment.mockRejectedValue(new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null }))
    const { result } = setup(() => useCreateComment('p1'))

    await act(async () => {
      await expect(result.current.mutateAsync('こんにちは')).rejects.toBeInstanceOf(ApiError)
    })

    expect(listed()).toEqual(['a', 'b'])
    expect(count()).toBe(2)
  })

  it('消すのに失敗したときは、一覧も commentCount も変えない', async () => {
    api.deleteComment.mockRejectedValue(new ApiError({ status: 403, code: 'FORBIDDEN', detail: '権限がありません', errors: [], requestId: null }))
    const { result } = setup(() => useDeleteComment('p1'))

    await act(async () => {
      await expect(result.current.mutateAsync('a')).rejects.toBeInstanceOf(ApiError)
    })

    expect(listed()).toEqual(['a', 'b'])
    expect(count()).toBe(2)
  })
})
