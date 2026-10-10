import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { Comment } from '../api/comments'
import type { Post } from '../api/posts'
import { renderWithProviders } from '../test/providers'
import PostDetailPage from './PostDetailPage'

const api = vi.hoisted(() => ({ getPost: vi.fn(), createPost: vi.fn(), updatePost: vi.fn(), deletePost: vi.fn() }))
vi.mock('../api/posts', () => api)

const commentsApi = vi.hoisted(() => ({ getComments: vi.fn(), createComment: vi.fn(), deleteComment: vi.fn() }))
vi.mock('../api/comments', () => commentsApi)

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../auth/AuthProvider', () => ({ useAuth }))

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
    body: '詳細の本文',
    images: [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    edited: false,
    createdAt: '2026-10-06T05:12:00Z',
    ...overrides,
  }
}

function makeComment(id: string, body: string): Comment {
  return {
    id,
    author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
    body,
    createdAt: '2026-10-06T05:20:00Z',
  }
}

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

function renderDetail() {
  return renderWithProviders(<PostDetailPage />, { route: '/posts/p1', path: '/posts/:id' })
}

describe('PostDetailPage', () => {
  beforeEach(() => {
    api.getPost.mockReset()
    api.deletePost.mockReset()
    commentsApi.getComments.mockReset()
    commentsApi.createComment.mockReset()
    commentsApi.getComments.mockResolvedValue({ items: [], nextCursor: null })
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u1', username: 'alice' } })
  })

  it('投稿と絶対時刻が出る。見出しは「投稿」', async () => {
    api.getPost.mockResolvedValue(makePost())
    renderDetail()

    expect(await screen.findByText('詳細の本文')).toBeInTheDocument()
    expect(screen.getByText('2026/10/06 14:12')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '投稿' })).toBeInTheDocument()
    expect(api.getPost).toHaveBeenCalledWith('p1')
  })

  it('「いいねした人を見る（0 件）」のリンクがあり、いいねのボタンとは別になっている', async () => {
    api.getPost.mockResolvedValue(makePost({ likeCount: 0 }))
    renderDetail()

    expect(await screen.findByRole('link', { name: 'いいねした人を見る（0 件）' })).toHaveAttribute('href', '/posts/p1/likes')
    expect(screen.getByRole('button', { name: 'いいね 0 件' })).toBeInTheDocument()
  })

  it('読み込み中は「読み込み中」を出す', () => {
    api.getPost.mockReturnValue(new Promise(() => {}))
    renderDetail()

    expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument()
  })

  it.each([
    [404, 'NOT_FOUND'],
    [400, 'INVALID_REQUEST'],
  ])('%i では「見つかりません」と「ホームへ戻る」が出る', async (status, code) => {
    api.getPost.mockRejectedValue(apiError({ status, code, detail: '対象がありません' }))
    renderDetail()

    expect(await screen.findByRole('heading', { level: 1, name: '見つかりません' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ホームへ戻る' })).toHaveAttribute('href', '/')
  })

  it('500 では「読み込みに失敗しました」が出て、「再試行」で読み直すと投稿が出る', async () => {
    api.getPost.mockRejectedValueOnce(apiError({ status: 500 }))
    api.getPost.mockResolvedValueOnce(makePost())
    renderDetail()
    const user = userEvent.setup()

    expect(await screen.findByText('読み込みに失敗しました')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '再試行' }))

    expect(await screen.findByText('詳細の本文')).toBeInTheDocument()
    expect(api.getPost).toHaveBeenCalledTimes(2)
  })

  it('削除すると、ホームへ移る', async () => {
    api.getPost.mockResolvedValue(makePost())
    api.deletePost.mockResolvedValue(undefined)
    renderDetail()
    const user = userEvent.setup()
    await screen.findByText('詳細の本文')

    await user.click(screen.getByRole('button', { name: 'この投稿の操作' }))
    await user.click(screen.getByRole('button', { name: '削除' }))
    const dialog = screen.getByRole('dialog', { name: 'この投稿を削除しますか？' })
    await user.click(within(dialog).getByRole('button', { name: '削除' }))

    expect(await screen.findByText('現在地: /')).toBeInTheDocument()
    expect(api.deletePost).toHaveBeenCalledWith('p1')
  })

  it('投稿の下に「コメント」の節があり、フォームと一覧が出る。0 件なら「まだコメントがありません」', async () => {
    api.getPost.mockResolvedValue(makePost())
    renderDetail()

    const section = await screen.findByRole('region', { name: 'コメント' })
    expect(within(section).getByRole('textbox', { name: 'コメント' })).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'コメントする' })).toBeInTheDocument()
    expect(await within(section).findByText('まだコメントがありません')).toBeInTheDocument()
  })

  it('コメントは新しい順に並び、getComments は (p1, null) で呼ばれる', async () => {
    api.getPost.mockResolvedValue(makePost({ commentCount: 2 }))
    commentsApi.getComments.mockResolvedValue({
      items: [makeComment('c2', '新しいコメント'), makeComment('c1', '古いコメント')],
      nextCursor: null,
    })
    renderDetail()

    const list = await screen.findByRole('list', { name: 'コメント一覧' })
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('新しいコメント')
    expect(items[1]).toHaveTextContent('古いコメント')
    expect(commentsApi.getComments).toHaveBeenCalledWith('p1', null)
  })

  it('コメントすると、一覧の先頭に自分のコメントが出て、カードのコメント数が 1 増える', async () => {
    api.getPost.mockResolvedValue(makePost({ commentCount: 1 }))
    commentsApi.getComments.mockResolvedValue({ items: [makeComment('c1', '先にあったコメント')], nextCursor: null })
    commentsApi.createComment.mockResolvedValue(makeComment('c2', 'いま書いたコメント'))
    renderDetail()
    const user = userEvent.setup()
    await screen.findByText('先にあったコメント')
    expect(screen.getByRole('img', { name: 'コメント 1 件' })).toBeInTheDocument()

    await user.click(screen.getByRole('textbox', { name: 'コメント' }))
    await user.paste('いま書いたコメント')
    await user.click(screen.getByRole('button', { name: 'コメントする' }))

    expect(await screen.findByRole('img', { name: 'コメント 2 件' })).toBeInTheDocument()
    const items = within(screen.getByRole('list', { name: 'コメント一覧' })).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('いま書いたコメント')
    expect(items[1]).toHaveTextContent('先にあったコメント')
    expect(commentsApi.createComment).toHaveBeenCalledWith('p1', 'いま書いたコメント')
  })

  it('投稿詳細のコメント数は押せない表示のまま', async () => {
    api.getPost.mockResolvedValue(makePost({ commentCount: 3 }))
    renderDetail()

    expect(await screen.findByRole('img', { name: 'コメント 3 件' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'コメント 3 件' })).not.toBeInTheDocument()
  })

  it('コメントの 404 でホームへ移る', async () => {
    api.getPost.mockResolvedValue(makePost())
    commentsApi.createComment.mockRejectedValue(apiError({ status: 404, code: 'NOT_FOUND', detail: '見つかりません' }))
    renderDetail()
    const user = userEvent.setup()
    await screen.findByRole('region', { name: 'コメント' })

    await user.click(screen.getByRole('textbox', { name: 'コメント' }))
    await user.paste('消えた投稿へのコメント')
    await user.click(screen.getByRole('button', { name: 'コメントする' }))

    expect(await screen.findByText('現在地: /')).toBeInTheDocument()
  })
})
