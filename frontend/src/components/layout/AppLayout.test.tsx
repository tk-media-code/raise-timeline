import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Me } from '../../api/auth'
import { AppLayout } from './AppLayout'

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../auth/AuthProvider', () => ({ useAuth }))

const me: Me = {
  id: '1',
  username: 'alice',
  displayName: 'アリス',
  avatarUrl: null,
  bio: '',
  isFollowing: false,
  followersCount: 0,
  followingCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  isMe: true,
  email: 'alice@example.com',
}

const signOut = vi.fn()

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<p>ホームの中身</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

// jsdom は CSS の media query を解釈しないので、PC の左ナビもスマホの上部バー・下部タブも全部描かれる。
// 同じ名前の部品が複数あるため、ランドマークで範囲を絞って引く。
describe('AppLayout', () => {
  beforeEach(() => {
    signOut.mockReset()
    signOut.mockResolvedValue(undefined)
    useAuth.mockReturnValue({ status: 'authenticated', user: me, signIn: vi.fn(), signOut })
  })

  it('中央に子ルートの中身を出す', () => {
    renderLayout()

    expect(within(screen.getByRole('main')).getByText('ホームの中身')).toBeInTheDocument()
  })

  it('左ナビにロゴ、ホーム、検索、プロフィールへのリンクと、自分の表示名を出す', () => {
    renderLayout()
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' })

    expect(within(nav).getByText('raise-timeline')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'ホーム' })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: '検索' })).toHaveAttribute('href', '/search')
    expect(within(nav).getByRole('link', { name: 'プロフィール' })).toHaveAttribute('href', '/users/alice')
    expect(within(nav).getByText('アリス')).toBeInTheDocument()
  })

  it('下部タブにホーム、検索、プロフィールを出す', () => {
    renderLayout()
    const tabs = screen.getByRole('navigation', { name: '下部タブ' })

    expect(within(tabs).getByRole('link', { name: 'ホーム' })).toHaveAttribute('href', '/')
    expect(within(tabs).getByRole('link', { name: '検索' })).toHaveAttribute('href', '/search')
    expect(within(tabs).getByRole('link', { name: 'プロフィール' })).toHaveAttribute('href', '/users/alice')
  })

  it('「投稿する」ボタンは、この段階では無効', () => {
    renderLayout()

    expect(screen.getByRole('button', { name: '投稿する' })).toBeDisabled()
  })

  it('ログアウトを押すだけでは signOut を呼ばず、確認ダイアログを開く', async () => {
    renderLayout()
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' })

    await userEvent.click(within(nav).getByRole('button', { name: 'ログアウト' }))

    expect(screen.getByRole('dialog', { name: 'ログアウトしますか？' })).toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('確認ダイアログの「ログアウト」で signOut を呼ぶ', async () => {
    renderLayout()
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' })
    await userEvent.click(within(nav).getByRole('button', { name: 'ログアウト' }))

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ログアウト' }))

    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('取り消しでは signOut を呼ばず、ダイアログを閉じる', async () => {
    renderLayout()
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' })
    await userEvent.click(within(nav).getByRole('button', { name: 'ログアウト' }))

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取り消し' }))

    expect(signOut).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('スマホの上部バーの「メニュー」からもログアウトの確認に進める', async () => {
    renderLayout()
    const header = screen.getByRole('banner')
    expect(within(header).queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument()

    await userEvent.click(within(header).getByRole('button', { name: 'メニュー' }))
    await userEvent.click(within(header).getByRole('button', { name: 'ログアウト' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ログアウト' }))

    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
