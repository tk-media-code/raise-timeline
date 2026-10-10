import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import { ApiError } from '../api/client'
import type { UserCard, UserDetail } from '../api/users'
import { renderWithProviders } from '../test/providers'
import FollowListPage from './FollowListPage'

const users = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('../api/users', () => users)

const follows = vi.hoisted(() => ({ getFollowers: vi.fn(), getFollowing: vi.fn(), followUser: vi.fn(), unfollowUser: vi.fn() }))
vi.mock('../api/follows', () => follows)

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../auth/AuthProvider', () => ({ useAuth }))

function makeDetail(overrides: Partial<UserDetail> = {}): UserDetail {
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

function makeCard(overrides: Partial<UserCard> = {}): UserCard {
  return { id: 'u2', username: 'bob', displayName: 'ボブ', avatarUrl: null, bio: '', isFollowing: false, ...overrides }
}

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

// 2 つのタブは同じ画面の kind 違い。タブを押して移る検査ができるよう、本番と同じく 2 つのルートを置く。
function renderList(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="followers" element={<FollowListPage kind="followers" />} />
      <Route path="following" element={<FollowListPage kind="following" />} />
    </Routes>,
    { route, path: '/users/:username/*' },
  )
}

describe('FollowListPage', () => {
  beforeEach(() => {
    users.getUser.mockReset()
    follows.getFollowers.mockReset()
    follows.getFollowing.mockReset()
    follows.followUser.mockReset()
    follows.unfollowUser.mockReset()
    users.getUser.mockResolvedValue(makeDetail())
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u9', username: 'me' } })
  })

  it('/users/alice/followers で、見出しはアリス、タブは「フォロー中」「フォロワー」の順で「フォロワー」が現在地。一覧の名前は「フォロワー」で getFollowers(alice, null) を呼ぶ', async () => {
    follows.getFollowers.mockResolvedValue({ items: [makeCard({ bio: 'よろしく' })], nextCursor: null })
    renderList('/users/alice/followers')

    const list = await screen.findByRole('list', { name: 'フォロワー' })
    expect(screen.getByRole('heading', { level: 1, name: 'アリス' })).toBeInTheDocument()
    // 見出しは上部バーに出ないので、スマホ幅でも隠さない。
    expect(screen.getByRole('heading', { level: 1, name: 'アリス' })).not.toHaveClass('max-md:sr-only')
    const tabs = within(screen.getByRole('navigation', { name: 'フォロー中とフォロワー' })).getAllByRole('link')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['フォロー中', 'フォロワー'])
    expect(tabs[0]).not.toHaveAttribute('aria-current')
    expect(tabs[1]).toHaveAttribute('aria-current', 'page')
    expect(within(list).getByRole('link', { name: 'ボブ @bob' })).toHaveAttribute('href', '/users/bob')
    expect(within(list).getByText('よろしく')).toBeInTheDocument()
    expect(follows.getFollowers).toHaveBeenCalledWith('alice', null)
    expect(follows.getFollowing).not.toHaveBeenCalled()
  })

  it('フォロー中のタブは /users/alice/following へのリンクで、移ると getFollowing を呼ぶ', async () => {
    follows.getFollowers.mockResolvedValue({ items: [makeCard()], nextCursor: null })
    follows.getFollowing.mockResolvedValue({ items: [makeCard({ id: 'u3', username: 'carol', displayName: 'キャロル' })], nextCursor: null })
    renderList('/users/alice/followers')
    const user = userEvent.setup()
    await screen.findByRole('list', { name: 'フォロワー' })

    const tab = within(screen.getByRole('navigation', { name: 'フォロー中とフォロワー' })).getByRole('link', { name: 'フォロー中' })
    expect(tab).toHaveAttribute('href', '/users/alice/following')
    await user.click(tab)

    const list = await screen.findByRole('list', { name: 'フォロー中' })
    expect(within(list).getByRole('link', { name: 'キャロル @carol' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'ボブ @bob' })).not.toBeInTheDocument()
    expect(follows.getFollowing).toHaveBeenCalledWith('alice', null)
    expect(
      within(screen.getByRole('navigation', { name: 'フォロー中とフォロワー' })).getByRole('link', { name: 'フォロー中' }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('0 件なら、フォロワーは「フォロワーはいません」、フォロー中は「誰もフォローしていません」', async () => {
    follows.getFollowers.mockResolvedValue({ items: [], nextCursor: null })
    follows.getFollowing.mockResolvedValue({ items: [], nextCursor: null })
    const { unmount } = renderList('/users/alice/followers')
    expect(await screen.findByText('フォロワーはいません')).toBeInTheDocument()
    unmount()

    renderList('/users/alice/following')
    expect(await screen.findByText('誰もフォローしていません')).toBeInTheDocument()
  })

  it('/users/Alice/followers でも、小文字のキーで同じ一覧を読む', async () => {
    follows.getFollowers.mockResolvedValue({ items: [makeCard()], nextCursor: null })
    const { queryClient } = renderList('/users/Alice/followers')

    await screen.findByRole('link', { name: 'ボブ @bob' })
    // API には打たれたままの名前を渡す（サーバーが大文字小文字を区別しない）。キャッシュは小文字の 1 つのキーに入る。
    expect(follows.getFollowers).toHaveBeenCalledWith('Alice', null)
    expect(queryClient.getQueryData(['follows', 'followers', 'alice'])).toBeDefined()
    expect(queryClient.getQueryData(['follows', 'followers', 'Alice'])).toBeUndefined()
  })

  it('プロフィールが 404 なら「見つかりません」で、一覧は読まない', async () => {
    users.getUser.mockRejectedValue(apiError({ status: 404, code: 'NOT_FOUND', detail: '対象がありません' }))
    renderList('/users/alice/followers')

    expect(await screen.findByRole('heading', { level: 1, name: '見つかりません' })).toBeInTheDocument()
    expect(follows.getFollowers).not.toHaveBeenCalled()
  })

  it('プロフィールが 500 なら「再試行」を出し、押すと読み直す', async () => {
    users.getUser.mockRejectedValueOnce(apiError({ status: 500 }))
    follows.getFollowers.mockResolvedValue({ items: [makeCard()], nextCursor: null })
    renderList('/users/alice/followers')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '再試行' }))

    expect(await screen.findByRole('link', { name: 'ボブ @bob' })).toBeInTheDocument()
    expect(users.getUser).toHaveBeenCalledTimes(2)
  })

  it('規則に合わない名前（/users/a%2Fb/followers）は API を呼ばずに「見つかりません」', async () => {
    renderList('/users/a%2Fb/followers')

    expect(await screen.findByRole('heading', { level: 1, name: '見つかりません' })).toBeInTheDocument()
    expect(users.getUser).not.toHaveBeenCalled()
    expect(follows.getFollowers).not.toHaveBeenCalled()
  })

  it('カードにフォローボタンが出て、自分のカードには出ない', async () => {
    follows.getFollowers.mockResolvedValue({
      items: [makeCard(), makeCard({ id: 'u9', username: 'me', displayName: '私', isFollowing: false })],
      nextCursor: null,
    })
    renderList('/users/alice/followers')

    const list = await screen.findByRole('list', { name: 'フォロワー' })
    expect(within(list).getByRole('button', { name: 'ボブさんをフォロー' })).toBeInTheDocument()
    expect(within(list).getByRole('link', { name: '私 @me' })).toBeInTheDocument()
    expect(within(list).queryByRole('button', { name: /私さんを/ })).not.toBeInTheDocument()
  })
})
