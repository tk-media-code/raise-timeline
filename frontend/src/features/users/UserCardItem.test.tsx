import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserCard } from '../../api/users'
import { TestProviders } from '../../test/providers'
import { UserCardItem } from './UserCardItem'

const api = vi.hoisted(() => ({ followUser: vi.fn(), unfollowUser: vi.fn() }))
vi.mock('../../api/follows', () => api)

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../auth/AuthProvider', () => ({ useAuth }))

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

function renderCard(user: UserCard = makeUser()) {
  return render(
    <TestProviders>
      <Routes>
        <Route path="/" element={<UserCardItem user={user} />} />
        <Route path="/users/:username" element={<p>プロフィールの画面</p>} />
      </Routes>
    </TestProviders>,
  )
}

beforeEach(() => {
  api.followUser.mockReset()
  api.followUser.mockResolvedValue(undefined)
  useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u9', username: 'bob' } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('UserCardItem', () => {
  it('アイコンと名前が /users/alice へのリンクで、表示名と @alice を出す', () => {
    renderCard()

    const link = screen.getByRole('link', { name: 'アリス @alice' })
    expect(link).toHaveAttribute('href', '/users/alice')
    expect(link).toHaveTextContent('アリス')
    expect(link).toHaveTextContent('@alice')
  })

  it('自己紹介を改行ごと出し、空なら段落を出さない', () => {
    const { unmount } = renderCard(makeUser({ bio: '一行目\n二行目' }))

    const bio = screen.getByText(/一行目/)
    expect(bio.textContent).toBe('一行目\n二行目')
    expect(bio).toHaveClass('whitespace-pre-wrap')
    unmount()

    renderCard(makeUser({ bio: '' }))
    expect(document.querySelector('p')).toBeNull()
  })

  it('カードの余白を押すとプロフィールへ移る。文字を選んでいる最中は移らない', async () => {
    const user = userEvent.setup()
    const { container, unmount } = renderCard(makeUser({ bio: '自己紹介' }))

    await user.click(container.firstElementChild as HTMLElement)
    expect(screen.getByText('プロフィールの画面')).toBeInTheDocument()
    unmount()

    renderCard(makeUser({ bio: '自己紹介' }))
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => '選んだ文字' } as Selection)
    await user.click(screen.getByText('自己紹介'))

    expect(screen.queryByText('プロフィールの画面')).not.toBeInTheDocument()
  })

  it('他人のカードの右端にフォローボタンが出て、自分のカードには出ない', () => {
    const { unmount } = renderCard()

    expect(screen.getByRole('button', { name: 'アリスさんをフォロー' })).toBeInTheDocument()
    unmount()

    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u1', username: 'alice' } })
    renderCard()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('フォローボタンを押しても、プロフィールへ移らない', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'アリスさんをフォロー' }))

    expect(screen.queryByText('プロフィールの画面')).not.toBeInTheDocument()
    await waitFor(() => expect(api.followUser).toHaveBeenCalledWith('alice'))
  })
})
