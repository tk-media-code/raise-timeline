import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPost, deletePost, getPost, getTimelineAll, updatePost } from './posts'

const post = {
  id: '11111111-1111-1111-1111-111111111111',
  author: { id: 'u1', username: 'alice', displayName: 'Alice', avatarUrl: null },
  body: 'こんにちは',
  images: [],
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  edited: false,
  createdAt: '2026-01-01T00:00:00Z',
}

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('投稿の API', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('createPost は POST /api/posts に、body の部品と、画像の数だけの images の部品（送った順）を持つ FormData を送る', async () => {
    fetchMock.mockResolvedValueOnce(ok(post, 201))
    const first = new File(['1'], 'first.png', { type: 'image/png' })
    const second = new File(['2'], 'second.jpg', { type: 'image/jpeg' })

    const result = await createPost('こんにちは', [first, second])

    expect(result).toEqual(post)
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/posts')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    const form = init.body as FormData
    expect(form.getAll('body')).toEqual(['こんにちは'])
    expect((form.getAll('images') as File[]).map((file) => file.name)).toEqual(['first.png', 'second.jpg'])
    expect(Array.from(form.keys())).toEqual(['body', 'images', 'images'])
    expect(new Headers(init.headers).get('Content-Type')).toBeNull()
  })

  it('createPost は画像が無ければ images の部品を付けない', async () => {
    fetchMock.mockResolvedValueOnce(ok(post, 201))

    await createPost('', [])

    const form = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData
    expect(Array.from(form.keys())).toEqual(['body'])
    expect(form.getAll('body')).toEqual([''])
  })

  it("getTimelineAll(null) は cursor を付けない。'abc' なら ?cursor=abc を付ける", async () => {
    fetchMock.mockImplementation(async () => ok({ items: [post], nextCursor: null }))

    await getTimelineAll(null)
    await getTimelineAll('abc')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/timeline/all')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/timeline/all?cursor=abc')
  })

  it('getTimelineAll は cursor を URL エンコードする', async () => {
    fetchMock.mockResolvedValueOnce(ok({ items: [], nextCursor: null }))

    await getTimelineAll('a&b=c')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/timeline/all?cursor=a%26b%3Dc')
  })

  it('updatePost は PATCH で { body } の JSON を送る', async () => {
    fetchMock.mockResolvedValueOnce(ok({ ...post, body: '直した', edited: true }))

    const result = await updatePost(post.id, '直した')

    expect(result.edited).toBe(true)
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe(`/api/posts/${post.id}`)
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe('{"body":"直した"}')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })

  it('deletePost は DELETE で、204 を受けて undefined を返す', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(deletePost(post.id)).resolves.toBeUndefined()

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe(`/api/posts/${post.id}`)
    expect(init.method).toBe('DELETE')
  })

  it('getPost は id を encodeURIComponent する', async () => {
    fetchMock.mockResolvedValueOnce(ok(post))

    await getPost('a/b?c')

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/posts/a%2Fb%3Fc')
    expect(init.method ?? 'GET').toBe('GET')
  })
})
