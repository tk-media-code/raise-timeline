import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createComment, deleteComment, getComments } from './comments'

describe('コメントの API', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('getComments は /api/posts/p%2F1/comments を呼び、cursor があれば ?cursor= を付ける', async () => {
    const page = { items: [], nextCursor: null }
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(page), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(getComments('p/1', null)).resolves.toEqual(page)
    await getComments('p/1', 'c/1')

    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('/api/posts/p%2F1/comments')
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe('/api/posts/p%2F1/comments?cursor=c%2F1')
  })

  it('createComment は POST で JSON の body を送り、作られたコメントを返す', async () => {
    const comment = {
      id: 'c1',
      author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
      body: 'こんにちは',
      createdAt: '2026-10-06T05:09:00Z',
    }
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(comment), { status: 201, headers: { 'Content-Type': 'application/json' } }))

    await expect(createComment('p/1', 'こんにちは')).resolves.toEqual(comment)

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/posts/p%2F1/comments')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ body: 'こんにちは' })
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })

  it('deleteComment は DELETE /api/comments/c%2F1 を呼び、204 を受けて undefined を返す', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))

    await expect(deleteComment('c/1')).resolves.toBeUndefined()

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/comments/c%2F1')
    expect(init.method).toBe('DELETE')
  })
})
