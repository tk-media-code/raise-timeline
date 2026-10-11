import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserDetail } from '../../api/users'
import { renderWithProviders } from '../../test/providers'
import { ProfileHeader } from './ProfileHeader'

const api = vi.hoisted(() => ({ followUser: vi.fn(), unfollowUser: vi.fn() }))
vi.mock('../../api/follows', () => api)

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../auth/AuthProvider', () => ({ useAuth }))

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

describe('ProfileHeader', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u9', username: 'bob' } })
  })

  it('見出しは表示名。アイコン（頭文字）、@ユーザー名、登録した月が出る', () => {
    renderWithProviders(<ProfileHeader user={makeUser()} />)

    expect(screen.getByRole('heading', { level: 1, name: 'アリス' })).toBeInTheDocument()
    expect(screen.getByText('ア')).toBeInTheDocument()
    expect(screen.getByText('@alice')).toBeInTheDocument()
    expect(screen.getByText('2026年10月に登録')).toBeInTheDocument()
  })

  it('自己紹介の改行が残り、HTML は文字のまま出る', () => {
    const { container } = renderWithProviders(<ProfileHeader user={makeUser({ bio: '一行目\n<b>太字</b>' })} />)

    const bio = screen.getByText(/一行目/)
    expect(bio.textContent).toBe('一行目\n<b>太字</b>')
    expect(bio).toHaveClass('whitespace-pre-wrap')
    expect(container.querySelector('b')).toBeNull()
  })

  it('自己紹介が空なら、その段落を出さない', () => {
    const { container } = renderWithProviders(<ProfileHeader user={makeUser({ bio: '' })} />)

    expect(container.querySelector('.whitespace-pre-wrap')).toBeNull()
  })

  it('「フォロー中 3」は /users/alice/following、「フォロワー 5」は /users/alice/followers へのリンク', () => {
    renderWithProviders(<ProfileHeader user={makeUser({ followingCount: 3, followersCount: 5 })} />)

    expect(screen.getByRole('link', { name: 'フォロー中 3' })).toHaveAttribute('href', '/users/alice/following')
    expect(screen.getByRole('link', { name: 'フォロワー 5' })).toHaveAttribute('href', '/users/alice/followers')
  })

  it('他人のプロフィールにはフォローボタンが出て、「プロフィールを編集」は出ない。自分には編集のリンクだけ', () => {
    const { unmount } = renderWithProviders(<ProfileHeader user={makeUser({ isMe: false })} />)

    expect(screen.getByRole('button', { name: 'アリスさんをフォロー' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'プロフィールを編集' })).toBeNull()
    unmount()

    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u1', username: 'alice' } })
    renderWithProviders(<ProfileHeader user={makeUser({ isMe: true })} />)
    expect(screen.getByRole('link', { name: 'プロフィールを編集' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('本人なら、「プロフィールを編集」が /settings/profile を指す', () => {
    renderWithProviders(<ProfileHeader user={makeUser({ isMe: true })} />)

    expect(screen.getByRole('link', { name: 'プロフィールを編集' })).toHaveAttribute('href', '/settings/profile')
  })

  it('他人なら、「プロフィールを編集」のリンクもボタンも無い', () => {
    renderWithProviders(<ProfileHeader user={makeUser({ isMe: false })} />)

    expect(screen.queryByRole('link', { name: 'プロフィールを編集' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'プロフィールを編集' })).toBeNull()
  })
})
