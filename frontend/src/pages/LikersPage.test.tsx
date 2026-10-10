import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { UserCard } from '../api/users'
import { renderWithProviders } from '../test/providers'
import LikersPage from './LikersPage'

const api = vi.hoisted(() => ({ getLikers: vi.fn(), likePost: vi.fn(), unlikePost: vi.fn() }))
vi.mock('../api/likes', () => api)

function makeUser(overrides: Partial<UserCard> = {}): UserCard {
  return {
    id: 'u1',
    username: 'alice',
    displayName: 'アリス',
    avatarUrl: null,
    bio: '',
    isFollowing: false,
    ...overrides,
  }
}

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

function renderLikers() {
  return renderWithProviders(<LikersPage />, { route: '/posts/p1/likes', path: '/posts/:id/likes' })
}

describe('LikersPage', () => {
  beforeEach(() => {
    api.getLikers.mockReset()
  })

  it('見出し「いいねした人」と、一覧「いいねした人」の中にユーザーカードが並ぶ。getLikers は (p1, null) で呼ばれる', async () => {
    api.getLikers.mockResolvedValue({
      items: [makeUser(), makeUser({ id: 'u2', username: 'bob', displayName: 'ボブ', bio: 'よろしく' })],
      nextCursor: null,
    })
    renderLikers()

    const list = await screen.findByRole('list', { name: 'いいねした人' })
    expect(screen.getByRole('heading', { level: 1, name: 'いいねした人' })).toBeInTheDocument()
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByRole('link', { name: 'ボブ @bob' })).toHaveAttribute('href', '/users/bob')
    expect(within(list).getByText('よろしく')).toBeInTheDocument()
    expect(api.getLikers).toHaveBeenCalledWith('p1', null)
  })

  it('0 件なら「まだいいねがありません」', async () => {
    api.getLikers.mockResolvedValue({ items: [], nextCursor: null })
    renderLikers()

    expect(await screen.findByText('まだいいねがありません')).toBeInTheDocument()
  })

  it('404 なら「見つかりません」の表示', async () => {
    api.getLikers.mockRejectedValue(apiError({ status: 404, code: 'NOT_FOUND', detail: '対象がありません' }))
    renderLikers()

    expect(await screen.findByRole('heading', { level: 1, name: '見つかりません' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ホームへ戻る' })).toHaveAttribute('href', '/')
  })

  it('500 なら再試行の表示が出て、「再試行」で読み直すと一覧が出る', async () => {
    api.getLikers.mockRejectedValueOnce(apiError({ status: 500 }))
    api.getLikers.mockResolvedValueOnce({ items: [makeUser()], nextCursor: null })
    renderLikers()
    const user = userEvent.setup()

    expect(await screen.findByText('読み込みに失敗しました')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '再試行' }))

    expect(await screen.findByRole('link', { name: 'アリス @alice' })).toBeInTheDocument()
    expect(api.getLikers).toHaveBeenCalledTimes(2)
  })
})
