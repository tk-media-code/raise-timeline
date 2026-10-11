import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page, Post } from '../api/posts'
import { renderWithProviders } from '../test/providers'
import HomePage from './HomePage'

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../auth/AuthProvider', () => ({ useAuth }))

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// fetch の代役。URL とメソッドで答えを返し、呼び出しを記録する。
type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>
function stubFetch(handler: Handler) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)))
  vi.stubGlobal('fetch', mock)
  return mock
}

function callsTo(mock: ReturnType<typeof stubFetch>, prefix: string) {
  return mock.mock.calls.filter(([url]) => String(url).startsWith(prefix))
}

// 既定のタブは「フォロー中」。どちらのタブの API を呼んだかを分けて数える。
function timelineCalls(mock: ReturnType<typeof stubFetch>) {
  return callsTo(mock, '/api/timeline/following')
}

// タブのリンクを押したあとの URL を確かめるための、現在地の表示。
function LocationProbe() {
  const { pathname, search } = useLocation()
  return <p data-testid="location">{pathname + search}</p>
}

function tabNav() {
  return screen.getByRole('navigation', { name: 'タイムラインの種類' })
}

const EMPTY = { items: [], nextCursor: null }

describe('HomePage', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u1', username: 'alice' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('/api/timeline/following の投稿が、カードで並ぶ', async () => {
    const page: Page<Post> = { items: [makePost('p1', '一つ目の投稿'), makePost('p2', '二つ目の投稿')], nextCursor: null }
    stubFetch(() => json(page))
    renderWithProviders(<HomePage />)

    const list = await screen.findByRole('list', { name: 'タイムライン' })

    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText('一つ目の投稿')).toBeInTheDocument()
    expect(within(list).getByText('二つ目の投稿')).toBeInTheDocument()
  })

  it('投稿すると、一覧の先頭に新しい投稿が出る。タイムラインは読み直さない', async () => {
    const created = makePost('p-new', '新しい投稿')
    const mock = stubFetch((url, init) => {
      if (url === '/api/posts' && init?.method === 'POST') return json(created, 201)
      return json({ items: [makePost('p1', '既にある投稿')], nextCursor: null })
    })
    renderWithProviders(<HomePage />)
    await screen.findByText('既にある投稿')
    const user = userEvent.setup()

    await user.click(screen.getByRole('textbox', { name: '本文' }))
    await user.paste('新しい投稿')
    await user.click(screen.getByRole('button', { name: '投稿する' }))

    expect(await screen.findByText('投稿しました')).toBeInTheDocument()
    const items = within(screen.getByRole('list', { name: 'タイムライン' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('新しい投稿')
    expect(items[1]).toHaveTextContent('既にある投稿')
    expect(timelineCalls(mock)).toHaveLength(1)
  })

  it('最初の読み込み中に投稿が成功したら、届いた古いページではなく、読み直した最新が出る', async () => {
    const created = makePost('p-new', '新しい投稿')
    let release: (response: Response) => void = () => {}
    const held = new Promise<Response>((resolve) => {
      release = resolve
    })
    let timelineRequests = 0
    const mock = stubFetch((url, init) => {
      if (url === '/api/posts' && init?.method === 'POST') return json(created, 201)
      timelineRequests += 1
      // 1 回目だけ止めておく。投稿の前の状態で返る。
      if (timelineRequests === 1) return held
      return json({ items: [created, makePost('p1', '既にある投稿')], nextCursor: null })
    })
    renderWithProviders(<HomePage />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('textbox', { name: '本文' }))
    await user.paste('新しい投稿')
    await user.click(screen.getByRole('button', { name: '投稿する' }))
    expect(await screen.findByText('投稿しました')).toBeInTheDocument()
    release(json({ items: [makePost('p1', '既にある投稿')], nextCursor: null }))

    const list = await screen.findByRole('list', { name: 'タイムライン' })
    expect(await within(list).findByText('新しい投稿')).toBeInTheDocument()
    expect(within(list).getByText('既にある投稿')).toBeInTheDocument()
    expect(timelineCalls(mock).length).toBeGreaterThanOrEqual(2)
  })

  it('「フォロー中」が空なら、「すべて」からフォローを促す文が出る', async () => {
    stubFetch(() => json(EMPTY))
    renderWithProviders(<HomePage />)

    expect(
      await screen.findByText('まだ投稿がありません。「すべて」から気になる人をフォローしてみましょう'),
    ).toBeInTheDocument()
  })

  it('「すべて」が空なら「まだ投稿がありません」だけが出る', async () => {
    stubFetch(() => json(EMPTY))
    renderWithProviders(<HomePage />, { route: '/?tab=all' })

    expect(await screen.findByText('まだ投稿がありません')).toBeInTheDocument()
    expect(screen.queryByText(/「すべて」から/)).not.toBeInTheDocument()
  })

  it('タブの並びは「フォロー中」「すべて」で、/ では「フォロー中」が現在のページ。getTimelineFollowing だけを呼ぶ', async () => {
    const mock = stubFetch(() => json(EMPTY))
    renderWithProviders(<HomePage />)

    const links = within(tabNav()).getAllByRole('link')

    expect(links.map((link) => link.textContent)).toEqual(['フォロー中', 'すべて'])
    expect(within(tabNav()).getByRole('link', { name: 'フォロー中' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabNav()).getByRole('link', { name: 'すべて' })).not.toHaveAttribute('aria-current')
    expect(await screen.findByText(/まだ投稿がありません/)).toBeInTheDocument()
    expect(callsTo(mock, '/api/timeline/following')).toHaveLength(1)
    expect(callsTo(mock, '/api/timeline/all')).toHaveLength(0)
  })

  it('/?tab=all では「すべて」が選ばれ、getTimelineAll だけを呼ぶ', async () => {
    const mock = stubFetch(() => json(EMPTY))
    renderWithProviders(<HomePage />, { route: '/?tab=all' })

    expect(within(tabNav()).getByRole('link', { name: 'すべて' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabNav()).getByRole('link', { name: 'フォロー中' })).not.toHaveAttribute('aria-current')
    expect(await screen.findByText('まだ投稿がありません')).toBeInTheDocument()
    expect(callsTo(mock, '/api/timeline/all')).toHaveLength(1)
    expect(callsTo(mock, '/api/timeline/following')).toHaveLength(0)
  })

  it.each(['/?tab=foo', '/?tab=following', '/?tab='])('%s は「フォロー中」として出る', async (route) => {
    const mock = stubFetch(() => json(EMPTY))
    renderWithProviders(<HomePage />, { route })

    expect(within(tabNav()).getByRole('link', { name: 'フォロー中' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText(/まだ投稿がありません/)).toBeInTheDocument()
    expect(callsTo(mock, '/api/timeline/following')).toHaveLength(1)
    expect(callsTo(mock, '/api/timeline/all')).toHaveLength(0)
  })

  it('タブのリンクは /?tab=following と /?tab=all で、押すと URL の tab が変わる', async () => {
    stubFetch(() => json(EMPTY))
    renderWithProviders(
      <>
        <HomePage />
        <LocationProbe />
      </>,
    )
    const user = userEvent.setup()
    const following = within(tabNav()).getByRole('link', { name: 'フォロー中' })
    const all = within(tabNav()).getByRole('link', { name: 'すべて' })
    expect(following).toHaveAttribute('href', '/?tab=following')
    expect(all).toHaveAttribute('href', '/?tab=all')

    await user.click(all)

    expect(screen.getByTestId('location')).toHaveTextContent('/?tab=all')
    expect(within(tabNav()).getByRole('link', { name: 'すべて' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText('まだ投稿がありません')).toBeInTheDocument()

    await user.click(within(tabNav()).getByRole('link', { name: 'フォロー中' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/?tab=following')
    expect(within(tabNav()).getByRole('link', { name: 'フォロー中' })).toHaveAttribute('aria-current', 'page')
  })

  it('フォロー中 → すべて → フォロー中 → すべてと切り替えても、それぞれの API は 1 回だけ呼ばれる', async () => {
    const mock = stubFetch((url) =>
      url.startsWith('/api/timeline/all')
        ? json({ items: [makePost('p-all', 'すべての投稿')], nextCursor: null })
        : json({ items: [makePost('p-following', 'フォロー中の投稿')], nextCursor: null }),
    )
    renderWithProviders(<HomePage />)
    const user = userEvent.setup()
    expect(await screen.findByText('フォロー中の投稿')).toBeInTheDocument()

    await user.click(within(tabNav()).getByRole('link', { name: 'すべて' }))
    expect(await screen.findByText('すべての投稿')).toBeInTheDocument()
    expect(screen.queryByText('フォロー中の投稿')).not.toBeInTheDocument()

    await user.click(within(tabNav()).getByRole('link', { name: 'フォロー中' }))
    expect(await screen.findByText('フォロー中の投稿')).toBeInTheDocument()
    expect(screen.queryByText('すべての投稿')).not.toBeInTheDocument()

    await user.click(within(tabNav()).getByRole('link', { name: 'すべて' }))
    expect(await screen.findByText('すべての投稿')).toBeInTheDocument()

    expect(callsTo(mock, '/api/timeline/following')).toHaveLength(1)
    expect(callsTo(mock, '/api/timeline/all')).toHaveLength(1)
  })

  it('タブを切り替えると、一覧の要素ごと作り直される（前のタブの一覧の要素を使い回さない）', async () => {
    stubFetch((url) =>
      url.startsWith('/api/timeline/all')
        ? json({ items: [makePost('p-all', 'すべての投稿')], nextCursor: null })
        : json({ items: [makePost('p-following', 'フォロー中の投稿')], nextCursor: null }),
    )
    renderWithProviders(<HomePage />)
    const user = userEvent.setup()
    const followingList = await screen.findByRole('list', { name: 'タイムライン' })

    await user.click(within(tabNav()).getByRole('link', { name: 'すべて' }))
    await screen.findByText('すべての投稿')
    const allList = screen.getByRole('list', { name: 'タイムライン' })

    expect(allList).not.toBe(followingList)
    expect(followingList).not.toBeInTheDocument()

    await user.click(within(tabNav()).getByRole('link', { name: 'フォロー中' }))
    await screen.findByText('フォロー中の投稿')

    expect(screen.getByRole('list', { name: 'タイムライン' })).not.toBe(allList)
    expect(allList).not.toBeInTheDocument()
  })

  it('/?tab=all で開いたあと「フォロー中」へ行っても、「すべて」は読み直さない', async () => {
    const mock = stubFetch(() => json(EMPTY))
    renderWithProviders(<HomePage />, { route: '/?tab=all' })
    const user = userEvent.setup()
    expect(await screen.findByText('まだ投稿がありません')).toBeInTheDocument()

    await user.click(within(tabNav()).getByRole('link', { name: 'フォロー中' }))
    expect(await screen.findByText(/から気になる人をフォロー/)).toBeInTheDocument()
    await user.click(within(tabNav()).getByRole('link', { name: 'すべて' }))
    expect(await screen.findByText('まだ投稿がありません')).toBeInTheDocument()

    expect(callsTo(mock, '/api/timeline/all')).toHaveLength(1)
    expect(callsTo(mock, '/api/timeline/following')).toHaveLength(1)
  })

  it('投稿すると、表示中の「フォロー中」の先頭に出る', async () => {
    const created = makePost('p-new', '新しい投稿')
    stubFetch((url, init) => {
      if (url === '/api/posts' && init?.method === 'POST') return json(created, 201)
      return json({ items: [makePost('p1', 'フォロー中の既存')], nextCursor: null })
    })
    renderWithProviders(<HomePage />)
    await screen.findByText('フォロー中の既存')
    const user = userEvent.setup()

    await user.click(screen.getByRole('textbox', { name: '本文' }))
    await user.paste('新しい投稿')
    await user.click(screen.getByRole('button', { name: '投稿する' }))

    expect(await screen.findByText('投稿しました')).toBeInTheDocument()
    const items = within(screen.getByRole('list', { name: 'タイムライン' })).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('新しい投稿')
    expect(items[1]).toHaveTextContent('フォロー中の既存')
  })

  it('「フォロー中」で投稿すると、読み込み済みの「すべて」の先頭にも足される', async () => {
    const created = makePost('p-new', '新しい投稿')
    const mock = stubFetch((url, init) => {
      if (url === '/api/posts' && init?.method === 'POST') return json(created, 201)
      return json({ items: [makePost(url.includes('/all') ? 'pa' : 'pf', url.includes('/all') ? 'すべての既存' : 'フォロー中の既存')], nextCursor: null })
    })
    renderWithProviders(<HomePage />)
    const user = userEvent.setup()
    await screen.findByText('フォロー中の既存')
    await user.click(within(tabNav()).getByRole('link', { name: 'すべて' }))
    await screen.findByText('すべての既存')
    await user.click(within(tabNav()).getByRole('link', { name: 'フォロー中' }))
    await screen.findByText('フォロー中の既存')

    await user.click(screen.getByRole('textbox', { name: '本文' }))
    await user.paste('新しい投稿')
    await user.click(screen.getByRole('button', { name: '投稿する' }))
    expect(await screen.findByText('投稿しました')).toBeInTheDocument()
    await user.click(within(tabNav()).getByRole('link', { name: 'すべて' }))

    const items = within(screen.getByRole('list', { name: 'タイムライン' })).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('新しい投稿')
    expect(items[1]).toHaveTextContent('すべての既存')
    expect(callsTo(mock, '/api/timeline/all')).toHaveLength(1)
  })

  it('見出し「ホーム」と、id が home-post-form の投稿フォームがある', async () => {
    stubFetch(() => json({ items: [], nextCursor: null }))
    const { container } = renderWithProviders(<HomePage />)

    expect(screen.getByRole('heading', { level: 1, name: 'ホーム' })).toBeInTheDocument()
    expect(container.querySelector('form#home-post-form')).not.toBeNull()
    expect(await screen.findByText(/まだ投稿がありません/)).toBeInTheDocument()
  })
})
