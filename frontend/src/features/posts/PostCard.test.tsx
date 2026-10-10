import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Post } from '../../api/posts'
import { PostCard } from './PostCard'

const NOW = new Date('2026-10-06T05:12:00Z')

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
    body: 'こんにちは https://example.com',
    images: [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    edited: false,
    createdAt: '2026-10-06T05:09:00Z',
    ...overrides,
  }
}

type Props = Partial<React.ComponentProps<typeof PostCard>>

function renderCard(props: Props = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={<PostCard post={makePost()} isMine={false} timeStyle="relative" linkToDetail={false} onToggleLike={() => {}} now={NOW} {...props} />}
        />
        <Route path="/posts/:id" element={<p>投稿詳細の画面</p>} />
        <Route path="/users/:username" element={<p>プロフィールの画面</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PostCard の表示', () => {
  it('表示名、@ユーザー名、本文を出す', () => {
    renderCard()

    expect(screen.getByText('アリス')).toBeInTheDocument()
    expect(screen.getByText('@alice')).toBeInTheDocument()
    expect(screen.getByText(/こんにちは/)).toBeInTheDocument()
  })

  it('time 要素に dateTime と絶対時刻の title を付け、相対時刻を出す', () => {
    renderCard()

    const time = screen.getByText('3 分前')
    expect(time.tagName).toBe('TIME')
    expect(time).toHaveAttribute('datetime', '2026-10-06T05:09:00Z')
    expect(time).toHaveAttribute('title', '2026/10/06 14:09')
  })

  it('timeStyle="absolute" では絶対時刻を出す', () => {
    renderCard({ post: makePost({ createdAt: '2026-10-06T05:12:34Z' }), timeStyle: 'absolute' })

    expect(screen.getByText('2026/10/06 14:12')).toBeInTheDocument()
    expect(screen.queryByText('たった今')).not.toBeInTheDocument()
  })

  it('「編集済み」は edited が true のときだけ出す', () => {
    const { unmount } = renderCard({ post: makePost({ edited: false }) })
    expect(screen.queryByText('編集済み')).not.toBeInTheDocument()
    unmount()

    renderCard({ post: makePost({ edited: true }) })
    expect(screen.getByText('編集済み')).toBeInTheDocument()
  })

  it('コメント数は、押せない表示（img）で出す', () => {
    renderCard({ post: makePost({ commentCount: 12 }) })

    expect(screen.getByRole('img', { name: 'コメント 12 件' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /コメント/ })).not.toBeInTheDocument()
  })
})

describe('PostCard のいいね', () => {
  it('いいねは「いいね 3 件」のボタンで、付けていなければ aria-pressed が false で ♡ を出す', () => {
    renderCard({ post: makePost({ likeCount: 3, likedByMe: false }) })

    const button = screen.getByRole('button', { name: 'いいね 3 件' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveTextContent('♡')
    expect(button).toHaveTextContent('3')
    expect(button).toHaveClass('min-h-11', 'min-w-11')
  })

  it('付けていれば aria-pressed が true で、♥ を出す', () => {
    renderCard({ post: makePost({ likeCount: 3, likedByMe: true }) })

    const button = screen.getByRole('button', { name: 'いいね 3 件' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveTextContent('♥')
    expect(button).not.toHaveTextContent('♡')
  })

  it('ボタンを押すと onToggleLike が呼ばれ、詳細へは移らない', async () => {
    const user = userEvent.setup()
    const onToggleLike = vi.fn()
    renderCard({ linkToDetail: true, onToggleLike })

    await user.click(screen.getByRole('button', { name: 'いいね 0 件' }))

    expect(onToggleLike).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('投稿詳細の画面')).not.toBeInTheDocument()
  })

  it('showLikersLink が無いときは、「いいねした人」のリンクは出さない', () => {
    renderCard({ post: makePost({ likeCount: 3 }) })

    expect(screen.queryByRole('link', { name: /いいねした人/ })).not.toBeInTheDocument()
  })

  it('showLikersLink のときは、ボタンとは別に「いいねした人を見る（3 件）」のリンクがあり、/posts/p1/likes を指す', () => {
    renderCard({ post: makePost({ likeCount: 3 }), showLikersLink: true })

    const link = screen.getByRole('link', { name: 'いいねした人を見る（3 件）' })
    expect(link).toHaveAttribute('href', '/posts/p1/likes')
    expect(link).toHaveTextContent('3')
    expect(link).toHaveClass('min-h-11', 'min-w-11')
    const button = screen.getByRole('button', { name: 'いいね 3 件' })
    expect(button).not.toHaveTextContent('3')
    expect(button).toHaveTextContent('♡')
  })
})

describe('PostCard のリンク', () => {
  it('アイコンと表示名のリンクはプロフィールへ', () => {
    renderCard()

    expect(screen.getByRole('link', { name: /アリス/ })).toHaveAttribute('href', '/users/alice')
  })

  it('@ユーザー名を押すと、linkToDetail が true でもプロフィールへ移る', async () => {
    const user = userEvent.setup()
    renderCard({ linkToDetail: true })

    await user.click(screen.getByText('@alice'))

    expect(screen.getByText('プロフィールの画面')).toBeInTheDocument()
    expect(screen.queryByText('投稿詳細の画面')).not.toBeInTheDocument()
  })

  it('アイコンと表示名と @ユーザー名は 1 つのリンクにまとまっている', () => {
    renderCard()

    expect(screen.getByRole('link', { name: 'アリス @alice' })).toHaveAttribute('href', '/users/alice')
  })

  it('時刻のリンクは投稿詳細へ', () => {
    renderCard()

    expect(screen.getByRole('link', { name: /3 分前/ })).toHaveAttribute('href', '/posts/p1')
  })
})

describe('PostCard のメニュー', () => {
  it('自分の投稿でなければ、メニューのボタンは無い', () => {
    renderCard({ isMine: false })

    expect(screen.queryByRole('button', { name: 'この投稿の操作' })).not.toBeInTheDocument()
  })

  it('自分の投稿なら、開くと「編集」「削除」が出る', async () => {
    const user = userEvent.setup()
    renderCard({ isMine: true, onEdit: vi.fn(), onDelete: vi.fn() })
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'この投稿の操作' }))

    expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'この投稿の操作' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('「編集」を押すと onEdit が 1 回呼ばれ、メニューは閉じる', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    renderCard({ isMine: true, onEdit, onDelete })

    await user.click(screen.getByRole('button', { name: 'この投稿の操作' }))
    await user.click(screen.getByRole('button', { name: '編集' }))

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
  })

  it('「削除」を押すと onDelete が 1 回呼ばれ、メニューは閉じる', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    renderCard({ isMine: true, onEdit, onDelete })

    await user.click(screen.getByRole('button', { name: 'この投稿の操作' }))
    await user.click(screen.getByRole('button', { name: '削除' }))

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })

  it('Esc で閉じ、フォーカスをメニューのボタンへ戻す', async () => {
    const user = userEvent.setup()
    renderCard({ isMine: true })

    await user.click(screen.getByRole('button', { name: 'この投稿の操作' }))
    await user.tab()
    expect(screen.getByRole('button', { name: '編集' })).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'この投稿の操作' })).toHaveFocus()
  })

  it('メニューの外（リンクでない本文）を押すと閉じる。カードは残る', async () => {
    const user = userEvent.setup()
    renderCard({ isMine: true, linkToDetail: false })

    await user.click(screen.getByRole('button', { name: 'この投稿の操作' }))
    expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument()
    await user.click(screen.getByText(/こんにちは/))

    // 画面が切り替わってカードごと消えたのではなく、メニューだけが閉じたことを確かめる。
    expect(screen.getByRole('button', { name: 'この投稿の操作' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
  })

  it('閉じている間は、aria-controls が存在しない id を指さない', async () => {
    const user = userEvent.setup()
    renderCard({ isMine: true })
    const trigger = screen.getByRole('button', { name: 'この投稿の操作' })
    expect(trigger).not.toHaveAttribute('aria-controls')

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-controls')
  })

  it('メニューのボタンをもう一度押すと閉じる', async () => {
    const user = userEvent.setup()
    renderCard({ isMine: true })

    await user.click(screen.getByRole('button', { name: 'この投稿の操作' }))
    await user.click(screen.getByRole('button', { name: 'この投稿の操作' }))

    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
  })
})

describe('PostCard の投稿詳細への移動', () => {
  it('linkToDetail が true なら、本文の文字を押すと投稿詳細へ移る', async () => {
    const user = userEvent.setup()
    renderCard({ linkToDetail: true })

    await user.click(screen.getByText(/こんにちは/))

    expect(screen.getByText('投稿詳細の画面')).toBeInTheDocument()
  })

  it('本文中のリンクを押しても、詳細へは移らない', async () => {
    const user = userEvent.setup()
    renderCard({ linkToDetail: true })
    const anchor = screen.getByRole('link', { name: 'https://example.com' })
    // jsdom は外部への移動を実装していない。移動そのものは見ず、カードの移動が起きないことだけ見る。
    anchor.addEventListener('click', (event) => event.preventDefault())

    await user.click(anchor)

    expect(screen.queryByText('投稿詳細の画面')).not.toBeInTheDocument()
  })

  it('メニューの枠（項目の外の余白）を押しても、詳細へは移らない', async () => {
    const user = userEvent.setup()
    renderCard({ linkToDetail: true, isMine: true, onEdit: vi.fn(), onDelete: vi.fn() })

    await user.click(screen.getByRole('button', { name: 'この投稿の操作' }))
    const frame = screen.getByRole('button', { name: '編集' }).parentElement as HTMLElement
    await user.click(frame)

    expect(screen.queryByText('投稿詳細の画面')).not.toBeInTheDocument()
  })

  it('メニューのボタンを押しても、詳細へは移らない', async () => {
    const user = userEvent.setup()
    renderCard({ linkToDetail: true, isMine: true, onEdit: vi.fn(), onDelete: vi.fn() })

    await user.click(screen.getByRole('button', { name: 'この投稿の操作' }))
    await user.click(screen.getByRole('button', { name: '編集' }))

    expect(screen.queryByText('投稿詳細の画面')).not.toBeInTheDocument()
  })

  it('文字を選んでいるときは、詳細へ移らない', async () => {
    const user = userEvent.setup()
    renderCard({ linkToDetail: true })
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => '選んだ文字' } as Selection)

    await user.click(screen.getByText(/こんにちは/))

    expect(screen.queryByText('投稿詳細の画面')).not.toBeInTheDocument()
  })

  it('linkToDetail が false なら、本文を押しても移らない', async () => {
    const user = userEvent.setup()
    renderCard({ linkToDetail: false })

    await user.click(screen.getByText(/こんにちは/))

    expect(screen.queryByText('投稿詳細の画面')).not.toBeInTheDocument()
  })
})

describe('PostCard の画像', () => {
  const images = [
    { id: 'i1', url: '/media/i1.jpg' },
    { id: 'i2', url: '/media/i2.jpg' },
    { id: 'i3', url: '/media/i3.jpg' },
  ]

  it('画像が無ければ並びを出さない', () => {
    renderCard()

    expect(screen.queryByRole('button', { name: /を拡大/ })).not.toBeInTheDocument()
  })

  it('画像があれば押せる並びで出す', () => {
    renderCard({ post: makePost({ images }) })

    expect(screen.getAllByRole('button', { name: /を拡大/ })).toHaveLength(3)
  })

  it('画像の並びを押してビューアを開いても、詳細へは移らない', async () => {
    const user = userEvent.setup()
    renderCard({ post: makePost({ images }), linkToDetail: true })

    await user.click(screen.getByRole('button', { name: '画像 2 を拡大' }))

    expect(screen.getByRole('dialog', { name: '画像' })).toBeInTheDocument()
    expect(screen.queryByText('投稿詳細の画面')).not.toBeInTheDocument()
  })

  it('並びの隙間（枠）を押しても、詳細へは移らない', async () => {
    const user = userEvent.setup()
    renderCard({ post: makePost({ images }), linkToDetail: true })
    const frame = screen.getByRole('button', { name: '画像 1 を拡大' }).parentElement as HTMLElement

    await user.click(frame)

    expect(screen.queryByText('投稿詳細の画面')).not.toBeInTheDocument()
  })

  it('ビューアの背景・次の画像・閉じるを押しても、詳細へは移らない', async () => {
    const user = userEvent.setup()
    renderCard({ post: makePost({ images }), linkToDetail: true })
    await user.click(screen.getByRole('button', { name: '画像 1 を拡大' }))

    // ビューアの <dialog> はカードの DOM の子孫なので、押下がカードまで届く。
    await user.click(screen.getByRole('button', { name: '次の画像' }))
    await user.click(screen.getByRole('img', { name: '画像 2 / 3' }).parentElement as HTMLElement)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('投稿詳細の画面')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '画像 1 を拡大' }))
    await user.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('投稿詳細の画面')).not.toBeInTheDocument()
  })
})
