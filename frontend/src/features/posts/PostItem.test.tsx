import type { InfiniteData } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import type { Page, Post } from '../../api/posts'
import { createQueryClient } from '../../lib/queryClient'
import { renderWithProviders } from '../../test/providers'
import { PostItem } from './PostItem'
import { postKey, timelineKeys } from './queryKeys'

const api = vi.hoisted(() => ({ createPost: vi.fn(), updatePost: vi.fn(), deletePost: vi.fn() }))
vi.mock('../../api/posts', () => api)

const likesApi = vi.hoisted(() => ({ likePost: vi.fn(), unlikePost: vi.fn() }))
vi.mock('../../api/likes', () => likesApi)

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../auth/AuthProvider', () => ({ useAuth }))

type Data = InfiniteData<Page<Post>, string | null>

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
    body: '元の本文',
    images: [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    edited: false,
    createdAt: '2026-10-06T05:09:00Z',
    ...overrides,
  }
}

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

function renderItem(options: { post?: Post } = {}) {
  const post = options.post ?? makePost()
  const queryClient = createQueryClient()
  const data: Data = { pages: [{ items: [post], nextCursor: null }], pageParams: [null] }
  queryClient.setQueryData(timelineKeys.all, data)
  queryClient.setQueryData(postKey(post.id), post)
  const onRemoved = vi.fn()
  const result = renderWithProviders(
    <PostItem post={post} timeStyle="absolute" linkToDetail={false} onRemoved={onRemoved} />,
    { queryClient },
  )
  return { ...result, queryClient, onRemoved }
}

function timelineItems(queryClient: ReturnType<typeof createQueryClient>): Post[] {
  return queryClient.getQueryData<Data>(timelineKeys.all)?.pages[0]?.items ?? []
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'この投稿の操作' }))
}

describe('PostItem', () => {
  beforeEach(() => {
    api.deletePost.mockReset()
    api.updatePost.mockReset()
    likesApi.likePost.mockReset()
    likesApi.unlikePost.mockReset()
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u1', username: 'alice' } })
  })

  it('自分の投稿の「削除」は確認を経て消え、「投稿を削除しました」が出て onRemoved が呼ばれる', async () => {
    api.deletePost.mockResolvedValue(undefined)
    const { queryClient, onRemoved } = renderItem()
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(screen.getByRole('button', { name: '削除' }))

    const dialog = screen.getByRole('dialog', { name: 'この投稿を削除しますか？' })
    expect(within(dialog).getByText('いいねとコメントも消えます')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '取り消し' })).toHaveFocus()
    expect(api.deletePost).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: '削除' }))

    expect(api.deletePost).toHaveBeenCalledWith('p1')
    expect(await screen.findByText('投稿を削除しました')).toBeInTheDocument()
    expect(timelineItems(queryClient)).toEqual([])
    expect(queryClient.getQueryData(postKey('p1'))).toBeUndefined()
    expect(onRemoved).toHaveBeenCalledTimes(1)
  })

  it('確認の「取り消し」では消さない。フォーカスは「この投稿の操作」に戻る', async () => {
    const { queryClient, onRemoved } = renderItem()
    const user = userEvent.setup()
    await openMenu(user)
    await user.click(screen.getByRole('button', { name: '削除' }))

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取り消し' }))

    expect(api.deletePost).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(timelineItems(queryClient)).toHaveLength(1)
    expect(onRemoved).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'この投稿の操作' })).toHaveFocus()
  })

  it('削除の 404 は「見つかりません」の通知で、一覧から除かれ、onRemoved が呼ばれる', async () => {
    api.deletePost.mockRejectedValue(apiError({ status: 404, detail: '見つかりません' }))
    const { queryClient, onRemoved } = renderItem()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const user = userEvent.setup()
    await openMenu(user)
    await user.click(screen.getByRole('button', { name: '削除' }))

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('見つかりません')
    expect(onRemoved).toHaveBeenCalledTimes(1)
    expect(timelineItems(queryClient)).toEqual([])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: timelineKeys.root })
  })

  it('削除の 403 は「この操作はできません」の通知で、onRemoved は呼ばれない', async () => {
    api.deletePost.mockRejectedValue(apiError({ status: 403, detail: 'この操作はできません' }))
    const { queryClient, onRemoved } = renderItem()
    const user = userEvent.setup()
    await openMenu(user)
    await user.click(screen.getByRole('button', { name: '削除' }))

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('この操作はできません')
    expect(onRemoved).not.toHaveBeenCalled()
    expect(timelineItems(queryClient)).toHaveLength(1)
  })

  it('削除の 500 は requestId を含む通知になり、投稿は残る', async () => {
    api.deletePost.mockRejectedValue(apiError({ status: 500, requestId: 'req-3' }))
    const { queryClient, onRemoved } = renderItem()
    const user = userEvent.setup()
    await openMenu(user)
    await user.click(screen.getByRole('button', { name: '削除' }))

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('問題が起きました（ID: req-3）')
    expect(onRemoved).not.toHaveBeenCalled()
    expect(timelineItems(queryClient)).toHaveLength(1)
  })

  it('「編集」で編集ダイアログが開く', async () => {
    renderItem()
    const user = userEvent.setup()
    await openMenu(user)

    await user.click(screen.getByRole('button', { name: '編集' }))

    const dialog = screen.getByRole('dialog', { name: '投稿を編集' })
    expect(within(dialog).getByRole('textbox', { name: '本文' })).toHaveValue('元の本文')
  })

  it('編集ダイアログを「取り消し」で閉じると、フォーカスは「この投稿の操作」に戻る', async () => {
    renderItem()
    const user = userEvent.setup()
    await openMenu(user)
    await user.click(screen.getByRole('button', { name: '編集' }))

    await user.click(screen.getByRole('button', { name: '取り消し' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'この投稿の操作' })).toHaveFocus()
  })

  it('編集を保存すると、ダイアログが閉じ、フォーカスは「この投稿の操作」に戻る', async () => {
    api.updatePost.mockResolvedValue(makePost({ body: '直した本文', edited: true }))
    renderItem()
    const user = userEvent.setup()
    await openMenu(user)
    await user.click(screen.getByRole('button', { name: '編集' }))
    const textbox = screen.getByRole('textbox', { name: '本文' })
    await user.clear(textbox)
    await user.click(textbox)
    await user.paste('直した本文')

    await user.click(screen.getByRole('button', { name: '保存' }))

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'この投稿の操作' })).toHaveFocus()
  })

  it('他人の投稿にはメニューが無い', () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u2', username: 'bob' } })
    renderItem()

    expect(screen.queryByRole('button', { name: 'この投稿の操作' })).not.toBeInTheDocument()
    expect(screen.getByText('元の本文')).toBeInTheDocument()
  })

  it('いいねを押すと likePost が呼ばれ、ボタンが aria-pressed true の「いいね 1 件」になる', async () => {
    likesApi.likePost.mockResolvedValue(undefined)
    const queryClient = createQueryClient()
    const post = makePost()
    queryClient.setQueryData(postKey(post.id), post)
    // 実際の画面と同じく、投稿はキャッシュから読む（いいねはキャッシュを書き換えて画面に出る）。
    function FromCache() {
      const { data } = useQuery({ queryKey: postKey(post.id), queryFn: () => post, staleTime: Infinity })
      return data ? <PostItem post={data} timeStyle="absolute" linkToDetail={false} /> : null
    }
    renderWithProviders(<FromCache />, { queryClient })
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'いいね 0 件' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'いいね 0 件' }))

    expect(await screen.findByRole('button', { name: 'いいね 1 件' })).toHaveAttribute('aria-pressed', 'true')
    await vi.waitFor(() => expect(likesApi.likePost).toHaveBeenCalledWith('p1'))
    expect(likesApi.unlikePost).not.toHaveBeenCalled()
  })
})
