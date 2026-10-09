import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

function timelineCalls(mock: ReturnType<typeof stubFetch>) {
  return mock.mock.calls.filter(([url]) => String(url).startsWith('/api/timeline/all'))
}

describe('HomePage', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u1', username: 'alice' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('/api/timeline/all の投稿が、カードで並ぶ', async () => {
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

  it('0 件のときは「まだ投稿がありません」が出る', async () => {
    stubFetch(() => json({ items: [], nextCursor: null }))
    renderWithProviders(<HomePage />)

    expect(await screen.findByText('まだ投稿がありません')).toBeInTheDocument()
  })

  it('タブの並びには「すべて」だけがあり、現在のページとして示される', async () => {
    stubFetch(() => json({ items: [], nextCursor: null }))
    renderWithProviders(<HomePage />)

    const nav = screen.getByRole('navigation', { name: 'タイムラインの種類' })

    expect(within(nav).getAllByRole('link')).toHaveLength(1)
    const link = within(nav).getByRole('link', { name: 'すべて' })
    expect(link).toHaveAttribute('href', '/')
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText('まだ投稿がありません')).toBeInTheDocument()
  })

  it('見出し「ホーム」と、id が home-post-form の投稿フォームがある', async () => {
    stubFetch(() => json({ items: [], nextCursor: null }))
    const { container } = renderWithProviders(<HomePage />)

    expect(screen.getByRole('heading', { level: 1, name: 'ホーム' })).toBeInTheDocument()
    expect(container.querySelector('form#home-post-form')).not.toBeNull()
    expect(await screen.findByText('まだ投稿がありません')).toBeInTheDocument()
  })
})
