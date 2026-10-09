import type { InfiniteData } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import type { Page, Post } from '../../api/posts'
import { createQueryClient } from '../../lib/queryClient'
import { renderWithProviders } from '../../test/providers'
import { PostForm } from './PostForm'
import { timelineKeys } from './queryKeys'

const api = vi.hoisted(() => ({ createPost: vi.fn(), updatePost: vi.fn(), deletePost: vi.fn() }))
vi.mock('../../api/posts', () => api)

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

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

async function typeBody(text: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('textbox', { name: '本文' }))
  await user.paste(text)
  return user
}

describe('PostForm', () => {
  beforeEach(() => {
    api.createPost.mockReset()
  })

  it('残り文字数が入力に合わせて変わり、281 文字で「残り -1 文字」が赤くなって送れない', async () => {
    renderWithProviders(<PostForm id="test-form" />)
    expect(screen.getByText('残り 280 文字')).toBeInTheDocument()

    await typeBody('あ'.repeat(10))
    expect(screen.getByText('残り 270 文字')).not.toHaveClass('text-red-700')
    expect(screen.getByRole('button', { name: '投稿する' })).toBeEnabled()

    const user = await typeBody('あ'.repeat(271))
    expect(screen.getByText('残り -1 文字')).toHaveClass('text-red-700')
    expect(screen.getByRole('button', { name: '投稿する' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '投稿する' }))
    expect(api.createPost).not.toHaveBeenCalled()
  })

  it('空と空白だけでは「投稿する」を押せない', async () => {
    renderWithProviders(<PostForm id="test-form" />)
    expect(screen.getByRole('button', { name: '投稿する' })).toBeDisabled()

    await typeBody(' \n　 ')

    expect(screen.getByRole('button', { name: '投稿する' })).toBeDisabled()
  })

  it('送信中はボタンが無効で、2 回押しても createPost は 1 回', async () => {
    api.createPost.mockReturnValue(new Promise(() => {}))
    renderWithProviders(<PostForm id="test-form" />)
    const user = await typeBody('こんにちは')

    await user.dblClick(screen.getByRole('button', { name: '投稿する' }))

    expect(api.createPost).toHaveBeenCalledTimes(1)
    expect(api.createPost).toHaveBeenCalledWith('こんにちは')
    expect(screen.getByRole('button', { name: '投稿する' })).toBeDisabled()
  })

  it('成功すると入力が空になり、「投稿しました」が出て、タイムラインの先頭に入り、onPosted が呼ばれる', async () => {
    const queryClient = createQueryClient()
    const existing: InfiniteData<Page<Post>, string | null> = {
      pages: [{ items: [makePost('old', '前の投稿')], nextCursor: null }],
      pageParams: [null],
    }
    queryClient.setQueryData(timelineKeys.all, existing)
    api.createPost.mockResolvedValue(makePost('new', 'こんにちは'))
    const onPosted = vi.fn()
    renderWithProviders(<PostForm id="test-form" onPosted={onPosted} />, { queryClient })
    const user = await typeBody('こんにちは')

    await user.click(screen.getByRole('button', { name: '投稿する' }))

    expect(await screen.findByText('投稿しました')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('')
    const data = queryClient.getQueryData<InfiniteData<Page<Post>, string | null>>(timelineKeys.all)
    expect(data?.pages[0]?.items.map((post) => post.id)).toEqual(['new', 'old'])
    expect(onPosted).toHaveBeenCalledTimes(1)
  })

  it('422 の body の誤りは入力欄の下に出て、入力は残る', async () => {
    api.createPost.mockRejectedValue(
      apiError({ status: 422, detail: '入力内容に誤りがあります', errors: [{ field: 'body', message: '本文か画像を入れてください' }] }),
    )
    renderWithProviders(<PostForm id="test-form" />)
    const user = await typeBody('こんにちは')

    await user.click(screen.getByRole('button', { name: '投稿する' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('本文か画像を入れてください')
    const textbox = screen.getByRole('textbox', { name: '本文' })
    expect(textbox).toHaveAccessibleDescription(expect.stringContaining('本文か画像を入れてください'))
    expect(textbox).toHaveAttribute('aria-invalid', 'true')
    expect(textbox).toHaveValue('こんにちは')
    expect(screen.queryByText('投稿しました')).not.toBeInTheDocument()
  })

  it('422 で body の誤りが無ければ、フォームの上部に detail を出す', async () => {
    api.createPost.mockRejectedValue(apiError({ status: 422, detail: '入力内容に誤りがあります' }))
    renderWithProviders(<PostForm id="test-form" />)
    const user = await typeBody('こんにちは')

    await user.click(screen.getByRole('button', { name: '投稿する' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('入力内容に誤りがあります')
    expect(screen.getByRole('textbox', { name: '本文' })).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('こんにちは')
  })

  it('500 は requestId を全桁含む通知になり、入力は残る', async () => {
    api.createPost.mockRejectedValue(apiError({ status: 500, requestId: 'req-1' }))
    renderWithProviders(<PostForm id="test-form" />)
    const user = await typeBody('こんにちは')

    await user.click(screen.getByRole('button', { name: '投稿する' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('問題が起きました（ID: req-1）')
    expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('こんにちは')
  })

  it('通信の失敗は「通信に失敗しました」の通知になり、入力は残る', async () => {
    api.createPost.mockRejectedValue(apiError({ status: 0, detail: '通信に失敗しました' }))
    renderWithProviders(<PostForm id="test-form" />)
    const user = await typeBody('こんにちは')

    await user.click(screen.getByRole('button', { name: '投稿する' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('通信に失敗しました')
    expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('こんにちは')
  })

  it('ApiError でない失敗は、固定の文言の通知になる', async () => {
    api.createPost.mockRejectedValue(new TypeError('boom'))
    renderWithProviders(<PostForm id="test-form" />)
    const user = await typeBody('こんにちは')

    await user.click(screen.getByRole('button', { name: '投稿する' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('問題が起きました。時間をおいて再試行してください')
  })

  it('失敗のあとは、もう一度送れる', async () => {
    api.createPost.mockRejectedValueOnce(apiError({ status: 500 })).mockResolvedValueOnce(makePost('new', 'こんにちは'))
    renderWithProviders(<PostForm id="test-form" />)
    const user = await typeBody('こんにちは')
    await user.click(screen.getByRole('button', { name: '投稿する' }))
    await screen.findByRole('alert')

    await waitFor(() => expect(screen.getByRole('button', { name: '投稿する' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '投稿する' }))

    expect(await screen.findByText('投稿しました')).toBeInTheDocument()
  })

  it('autoFocus を渡すと、入力欄にフォーカスが当たる', () => {
    // oxlint-disable-next-line jsx-a11y/no-autofocus -- フォーカスを置く振る舞いそのものの検査
    renderWithProviders(<PostForm id="test-form" autoFocus />)

    expect(screen.getByRole('textbox', { name: '本文' })).toHaveFocus()
  })
})
