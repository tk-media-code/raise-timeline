import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { Post } from '../api/posts'
import { renderWithProviders } from '../test/providers'
import PostDetailPage from './PostDetailPage'

const api = vi.hoisted(() => ({ getPost: vi.fn(), createPost: vi.fn(), updatePost: vi.fn(), deletePost: vi.fn() }))
vi.mock('../api/posts', () => api)

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
})
