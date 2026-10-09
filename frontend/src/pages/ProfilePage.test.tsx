import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { Post } from '../api/posts'
import type { UserDetail } from '../api/users'
import { userKey } from '../features/profile/queryKeys'
import { renderWithProviders } from '../test/providers'
import ProfilePage from './ProfilePage'

const api = vi.hoisted(() => ({ getUser: vi.fn(), getUserPosts: vi.fn(), getMe: vi.fn(), updateMe: vi.fn() }))
vi.mock('../api/users', () => api)

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../auth/AuthProvider', () => ({ useAuth }))

function makeUser(overrides: Partial<UserDetail> = {}): UserDetail {
  return {
    id: 'u1',
    username: 'alice',
    displayName: 'アリス',
    avatarUrl: null,
    bio: '',
    isFollowing: false,
    followersCount: 0,
    followingCount: 0,
    createdAt: '2026-10-01T00:00:00Z',
    isMe: false,
    ...overrides,
  }
}

function makePost(id: string, body: string): Post {
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

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

function renderProfile(username = 'alice') {
  return renderWithProviders(<ProfilePage />, { route: `/users/${username}`, path: '/users/:username' })
}

describe('ProfilePage', () => {
  beforeEach(() => {
    api.getUser.mockReset()
    api.getUserPosts.mockReset()
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u2', username: 'bob' } })
  })

  it('上部と投稿一覧が出る', async () => {
    api.getUser.mockResolvedValue(makeUser())
    api.getUserPosts.mockResolvedValue({ items: [makePost('p1', '一つ目の投稿'), makePost('p2', '二つ目の投稿')], nextCursor: null })
    renderProfile()

    expect(await screen.findByRole('heading', { level: 1, name: 'アリス' })).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: '投稿一覧' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText('一つ目の投稿')).toBeInTheDocument()
    expect(api.getUserPosts).toHaveBeenCalledWith('alice', null)
  })

  it('投稿が無ければ「まだ投稿がありません」が出る', async () => {
    api.getUser.mockResolvedValue(makeUser())
    api.getUserPosts.mockResolvedValue({ items: [], nextCursor: null })
    renderProfile()

    expect(await screen.findByText('まだ投稿がありません')).toBeInTheDocument()
  })

  it('読み込み中は「読み込み中」を出す', () => {
    api.getUser.mockReturnValue(new Promise(() => {}))
    renderProfile()

    expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument()
  })

  it.each([
    [404, 'NOT_FOUND'],
    [400, 'INVALID_REQUEST'],
  ])('%i では「見つかりません」が出て、投稿一覧は引かない', async (status, code) => {
    api.getUser.mockRejectedValue(apiError({ status, code, detail: '対象がありません' }))
    renderProfile()

    expect(await screen.findByRole('heading', { level: 1, name: '見つかりません' })).toBeInTheDocument()
    expect(api.getUserPosts).not.toHaveBeenCalled()
  })

  it.each(['me', 'ab', 'a'.repeat(21), 'a-b'])(
    '/users/%s はユーザー名の規則に合わないので、APIを呼ばずに「見つかりません」を出す',
    async (username) => {
      renderProfile(username)

      expect(await screen.findByRole('heading', { level: 1, name: '見つかりません' })).toBeInTheDocument()
      expect(api.getUser).not.toHaveBeenCalled()
      expect(api.getUserPosts).not.toHaveBeenCalled()
    },
  )

  it('500 では「読み込みに失敗しました」が出て、「再試行」で読み直すと出る', async () => {
    api.getUser.mockRejectedValueOnce(apiError({ status: 500 }))
    api.getUser.mockResolvedValueOnce(makeUser())
    api.getUserPosts.mockResolvedValue({ items: [], nextCursor: null })
    renderProfile()
    const user = userEvent.setup()

    expect(await screen.findByText('読み込みに失敗しました')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '再試行' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'アリス' })).toBeInTheDocument()
    expect(api.getUser).toHaveBeenCalledTimes(2)
  })

  it('/users/Alice は getUser("Alice") を呼び、キャッシュは userKey("alice") に入る', async () => {
    api.getUser.mockResolvedValue(makeUser())
    api.getUserPosts.mockResolvedValue({ items: [], nextCursor: null })
    const { queryClient } = renderProfile('Alice')

    await screen.findByRole('heading', { level: 1, name: 'アリス' })

    expect(api.getUser).toHaveBeenCalledWith('Alice')
    expect(queryClient.getQueryData(userKey('alice'))).toEqual(makeUser())
  })
})
