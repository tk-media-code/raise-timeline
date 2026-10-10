import type { InfiniteData } from '@tanstack/react-query'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Comment } from '../../api/comments'
import { ApiError } from '../../api/client'
import type { Page, Post } from '../../api/posts'
import { createQueryClient } from '../../lib/queryClient'
import { renderWithProviders } from '../../test/providers'
import { postKey } from '../posts/queryKeys'
import { CommentItem } from './CommentItem'
import { commentsKeys } from './queryKeys'

const api = vi.hoisted(() => ({ getComments: vi.fn(), createComment: vi.fn(), deleteComment: vi.fn() }))
vi.mock('../../api/comments', () => api)

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../auth/AuthProvider', () => ({ useAuth }))

type Data = InfiniteData<Page<Comment>, string | null>

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
    body: 'コメントの本文',
    createdAt: '2026-10-06T05:09:00Z',
    ...overrides,
  }
}

function makePost(): Post {
  return {
    id: 'p1',
    author: { id: 'u2', username: 'bob', displayName: 'ボブ', avatarUrl: null },
    body: '投稿',
    images: [],
    likeCount: 0,
    commentCount: 1,
    likedByMe: false,
    edited: false,
    createdAt: '2026-10-06T05:00:00Z',
  }
}

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

function renderItem(comment = makeComment(), now?: Date) {
  const queryClient = createQueryClient()
  const data: Data = { pages: [{ items: [comment], nextCursor: null }], pageParams: [null] }
  queryClient.setQueryData(commentsKeys.of('p1'), data)
  queryClient.setQueryData(postKey('p1'), makePost())
  const result = renderWithProviders(<CommentItem comment={comment} postId="p1" now={now} />, { queryClient })
  return { ...result, queryClient }
}

function listItems(queryClient: ReturnType<typeof createQueryClient>): Comment[] {
  return queryClient.getQueryData<Data>(commentsKeys.of('p1'))?.pages[0]?.items ?? []
}

describe('CommentItem', () => {
  beforeEach(() => {
    api.deleteComment.mockReset()
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u1', username: 'alice' } })
  })

  it('アイコンと名前が /users/alice へのリンクで、表示名と @alice、相対時刻（title は絶対時刻）を出す', () => {
    renderItem(makeComment(), new Date('2026-10-06T05:12:00Z'))

    const link = screen.getByRole('link', { name: /アリス/ })
    expect(link).toHaveAttribute('href', '/users/alice')
    expect(link).toHaveTextContent('@alice')
    const time = screen.getByText('3 分前')
    expect(time.tagName).toBe('TIME')
    expect(time).toHaveAttribute('datetime', '2026-10-06T05:09:00Z')
    expect(time).toHaveAttribute('title', '2026/10/06 14:09')
  })

  it('本文の改行を保ち、<b>x</b> は文字のまま、https:// の URL はリンクになる', () => {
    renderItem(makeComment({ body: '1行目\n<b>x</b>\nhttps://example.com/a' }))

    const body = screen.getByText(/1行目/)
    expect(body).toHaveClass('whitespace-pre-wrap')
    expect(body).toHaveTextContent('<b>x</b>')
    expect(body.querySelector('b')).toBeNull()
    expect(screen.getByRole('link', { name: 'https://example.com/a' })).toHaveAttribute('href', 'https://example.com/a')
  })

  it('本人のコメントだけ「このコメントを削除」ボタンが出る', () => {
    const { unmount } = renderItem()
    expect(screen.getByRole('button', { name: 'このコメントを削除' })).toBeInTheDocument()
    unmount()

    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u9', username: 'zed' } })
    renderItem()
    expect(screen.queryByRole('button', { name: 'このコメントを削除' })).not.toBeInTheDocument()
  })

  it('削除を押すと「このコメントを削除しますか？」が出て、取り消しでは deleteComment を呼ばない', async () => {
    renderItem()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'このコメントを削除' }))

    const dialog = screen.getByRole('dialog', { name: 'このコメントを削除しますか？' })
    expect(within(dialog).getByRole('button', { name: '取り消し' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: '取り消し' }))

    expect(api.deleteComment).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'このコメントを削除' })).toHaveFocus()
  })

  it('確認で deleteComment(c1) を呼び、「コメントを削除しました」を通知する', async () => {
    api.deleteComment.mockResolvedValue(undefined)
    const { queryClient } = renderItem()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'このコメントを削除' }))

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }))

    expect(api.deleteComment).toHaveBeenCalledWith('c1')
    expect(await screen.findByText('コメントを削除しました')).toBeInTheDocument()
    expect(listItems(queryClient)).toEqual([])
  })

  it('404 は「見つかりません」を通知し、一覧からコメントが除かれ、投稿詳細が読み直しの対象になる', async () => {
    api.deleteComment.mockRejectedValue(apiError({ status: 404, code: 'NOT_FOUND', detail: '見つかりません' }))
    const { queryClient } = renderItem()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'このコメントを削除' }))

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }))

    expect(await screen.findByText('見つかりません')).toBeInTheDocument()
    expect(listItems(queryClient)).toEqual([])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: postKey('p1'), exact: true })
  })

  it('500 は ID 付きの文言を通知し、一覧に残る', async () => {
    api.deleteComment.mockRejectedValue(apiError({ status: 500, requestId: 'req-1' }))
    const { queryClient } = renderItem()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'このコメントを削除' }))

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }))

    expect(await screen.findByText(/req-1/)).toBeInTheDocument()
    expect(listItems(queryClient)).toHaveLength(1)
  })
})
