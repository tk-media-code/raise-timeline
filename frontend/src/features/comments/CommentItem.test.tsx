import type { InfiniteData } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

// 実際の一覧と同じく、コメントはキャッシュから読み、ul > li の中に並べる。
function renderList(comments: Comment[]) {
  const queryClient = createQueryClient()
  const data: Data = { pages: [{ items: comments, nextCursor: null }], pageParams: [null] }
  queryClient.setQueryData(commentsKeys.of('p1'), data)
  queryClient.setQueryData(postKey('p1'), makePost())
  function List() {
    const { data: cached } = useQuery<Data>({
      queryKey: commentsKeys.of('p1'),
      // 取り直しが走っても、消した結果のキャッシュをそのまま返す（元の一覧に戻さない）。
      queryFn: () => queryClient.getQueryData<Data>(commentsKeys.of('p1')) ?? data,
      staleTime: Infinity,
    })
    return (
      <main>
        <h1>投稿</h1>
        <ul>
          {cached?.pages[0]?.items.map((comment) => (
            <li key={comment.id}>
              <CommentItem comment={comment} postId="p1" />
            </li>
          ))}
        </ul>
      </main>
    )
  }
  return renderWithProviders(<List />, { queryClient })
}

async function deleteIn(user: ReturnType<typeof userEvent.setup>, article: HTMLElement) {
  await user.click(within(article).getByRole('button', { name: 'このコメントを削除' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }))
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

  it('確認の「削除」を同じ tick で 2 回押しても、deleteComment は 1 回だけ', async () => {
    api.deleteComment.mockReturnValue(new Promise(() => {}))
    renderItem()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'このコメントを削除' }))
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: '削除' })

    fireEvent.click(confirm)
    fireEvent.click(confirm)

    // mutate は非同期に deleteComment を呼ぶ。1 回目が呼ばれるのを待ち、2 回目が来る余地を流してから数える。
    await waitFor(() => expect(api.deleteComment).toHaveBeenCalled())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(api.deleteComment).toHaveBeenCalledTimes(1)
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

describe('CommentItem の削除のあとのフォーカス', () => {
  beforeEach(() => {
    api.deleteComment.mockReset()
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u1', username: 'alice' } })
  })

  it('一覧でコメントを消すと、フォーカスが次のコメントに移る', async () => {
    api.deleteComment.mockResolvedValue(undefined)
    renderList([makeComment({ id: 'c1' }), makeComment({ id: 'c2' }), makeComment({ id: 'c3' })])
    const user = userEvent.setup()
    const [first, second] = screen.getAllByRole('article')

    await deleteIn(user, first as HTMLElement)

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(second).toHaveFocus()
  })

  it('最後のコメントを消すと、フォーカスが前のコメントに移る', async () => {
    api.deleteComment.mockResolvedValue(undefined)
    renderList([makeComment({ id: 'c1' }), makeComment({ id: 'c2' })])
    const user = userEvent.setup()
    const [first, second] = screen.getAllByRole('article')

    await deleteIn(user, second as HTMLElement)

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))
    expect(first).toHaveFocus()
  })

  it('最後の 1 件を消すと、フォーカスがページの見出しに移る', async () => {
    api.deleteComment.mockResolvedValue(undefined)
    renderList([makeComment({ id: 'c1' })])
    const user = userEvent.setup()

    await deleteIn(user, screen.getByRole('article'))

    await waitFor(() => expect(screen.queryByRole('article')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  it('消すのに失敗したら、フォーカスは動かない（「このコメントを削除」に戻ったまま）', async () => {
    api.deleteComment.mockRejectedValue(apiError({ status: 500 }))
    renderList([makeComment({ id: 'c1' }), makeComment({ id: 'c2' })])
    const user = userEvent.setup()
    const [first] = screen.getAllByRole('article')

    await deleteIn(user, first as HTMLElement)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(within(first as HTMLElement).getByRole('button', { name: 'このコメントを削除' })).toHaveFocus()
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('404 で一覧から除かれたときも、フォーカスが次のコメントに移る', async () => {
    api.deleteComment.mockRejectedValue(apiError({ status: 404, code: 'NOT_FOUND', detail: '見つかりません' }))
    renderList([makeComment({ id: 'c1' }), makeComment({ id: 'c2' })])
    const user = userEvent.setup()
    const [first, second] = screen.getAllByRole('article')

    await deleteIn(user, first as HTMLElement)

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))
    expect(second).toHaveFocus()
  })
})

describe('CommentItem の相対時刻の更新', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u9', username: 'zed' } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('now を渡さないとき、1 分前のコメントは 60 秒後に「2 分前」になる', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T05:10:30Z'))
    renderItem()
    expect(screen.getByText('1 分前')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(screen.getByText('2 分前')).toBeInTheDocument()
  })
})
