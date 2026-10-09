import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Me } from '../../api/auth'
import type { Post } from '../../api/posts'
import { TestProviders } from '../../test/providers'
import { AppLayout } from './AppLayout'

const api = vi.hoisted(() => ({ createPost: vi.fn(), updatePost: vi.fn(), deletePost: vi.fn() }))
vi.mock('../../api/posts', () => api)

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

// レイアウトルートの検査なので、自分で <Routes> を書く（renderWithProviders は使わない）。
function renderLayout(route = '/') {
  return render(
    <TestProviders route={route}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<p>ホームの中身</p>} />
          <Route path="/posts/:id" element={<p>投稿詳細の中身</p>} />
          <Route path="/settings/profile" element={<p>プロフィール編集の中身</p>} />
        </Route>
      </Routes>
    </TestProviders>,
  )
}

const newPost: Post = {
  id: 'p-new',
  author: { id: '1', username: 'alice', displayName: 'アリス', avatarUrl: null },
  body: 'こんにちは',
  images: [],
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  edited: false,
  createdAt: '2026-10-06T05:09:00Z',
}

// jsdom は CSS の media query を解釈しないので、PC の左ナビもスマホの上部バー・下部タブも全部描かれる。
// 同じ名前の部品が複数あるため、ランドマークで範囲を絞って引く。
describe('AppLayout', () => {
  beforeEach(() => {
    signOut.mockReset()
    api.createPost.mockReset()
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

  it('左ナビの「投稿する」で「新しい投稿」のダイアログが開き、投稿すると閉じる', async () => {
    api.createPost.mockResolvedValue(newPost)
    renderLayout()
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(within(nav).getByRole('button', { name: '投稿する' }))

    const dialog = screen.getByRole('dialog', { name: '新しい投稿' })
    expect(within(dialog).getByRole('textbox', { name: '本文' })).toHaveFocus()
    await userEvent.paste('こんにちは')
    await userEvent.click(within(dialog).getByRole('button', { name: '投稿する' }))

    expect(api.createPost).toHaveBeenCalledWith('こんにちは')
    expect(await screen.findByText('投稿しました')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('スマホの丸ボタン（2 つ目の「投稿する」）でも同じダイアログが開き、「閉じる」で閉じる', async () => {
    renderLayout()
    const buttons = screen.getAllByRole('button', { name: '投稿する' })
    expect(buttons).toHaveLength(2)

    await userEvent.click(buttons[1]!)

    const dialog = screen.getByRole('dialog', { name: '新しい投稿' })
    await userEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.createPost).not.toHaveBeenCalled()
  })

  it('ブラウザが先にダイアログを閉じても（open のまま close()）、状態が合い、もう一度開ける', async () => {
    renderLayout()
    const nav = screen.getByRole('navigation', { name: 'メインメニュー' })
    await userEvent.click(within(nav).getByRole('button', { name: '投稿する' }))
    const dialog = screen.getByRole('dialog', { name: '新しい投稿' })

    // Esc を重ねたときの強制的な close や、Android の戻る操作は、ページの状態を経ずにブラウザが閉じる。
    act(() => {
      ;(dialog as HTMLDialogElement).close()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(within(nav).getByRole('button', { name: '投稿する' }))
    expect(screen.getByRole('dialog', { name: '新しい投稿' })).toBeInTheDocument()
  })

  it('/posts/x では上部バーの画面名が「投稿」', () => {
    renderLayout('/posts/x')

    expect(within(screen.getByRole('banner')).getByText('投稿')).toBeInTheDocument()
  })

  it('/settings/profile では上部バーの画面名が「プロフィール編集」', () => {
    renderLayout('/settings/profile')

    expect(within(screen.getByRole('banner')).getByText('プロフィール編集')).toBeInTheDocument()
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
