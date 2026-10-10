import type { InfiniteData } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Comment } from '../../api/comments'
import { ApiError } from '../../api/client'
import type { Page, Post } from '../../api/posts'
import { renderWithProviders } from '../../test/providers'
import { timelineKeys } from '../posts/queryKeys'
import { CommentForm } from './CommentForm'

const api = vi.hoisted(() => ({ getComments: vi.fn(), createComment: vi.fn(), deleteComment: vi.fn() }))
vi.mock('../../api/comments', () => api)

function makeComment(id: string, body: string): Comment {
  return {
    id,
    author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
    body,
    createdAt: '2026-10-06T05:09:00Z',
  }
}

function makePost(id: string): Post {
  return {
    id,
    author: { id: 'u2', username: 'bob', displayName: 'ボブ', avatarUrl: null },
    body: '投稿',
    images: [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    edited: false,
    createdAt: '2026-10-06T05:00:00Z',
  }
}

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

const textbox = () => screen.getByRole('textbox', { name: 'コメント' })
const submitButton = () => screen.getByRole('button', { name: 'コメントする' })

async function typeBody(text: string) {
  const user = userEvent.setup()
  await user.click(textbox())
  await user.paste(text)
  return user
}

function renderForm() {
  const onPostGone = vi.fn()
  const result = renderWithProviders(<CommentForm postId="p1" onPostGone={onPostGone} />)
  return { ...result, onPostGone }
}

describe('CommentForm', () => {
  beforeEach(() => {
    api.createComment.mockReset()
  })

  it('名前「コメント」の入力欄（例示「コメントを入力」）と「コメントする」があり、空ではボタンが無効', () => {
    renderForm()

    expect(textbox()).toHaveAttribute('placeholder', 'コメントを入力')
    expect(textbox()).toHaveAttribute('id', 'comment-body')
    expect(submitButton()).toBeDisabled()
  })

  it('全角空白と改行だけではボタンが無効', async () => {
    renderForm()

    await typeBody('　\n　 \n')

    expect(submitButton()).toBeDisabled()
  })

  it('残り文字数が変わり、281 文字ではボタンが無効', async () => {
    renderForm()
    expect(screen.getByText('残り 280 文字')).toBeInTheDocument()

    await typeBody('あ'.repeat(10))
    expect(screen.getByText('残り 270 文字')).toBeInTheDocument()
    expect(submitButton()).toBeEnabled()

    await typeBody('あ'.repeat(271))
    expect(screen.getByText('残り -1 文字')).toHaveClass('text-red-700')
    expect(submitButton()).toBeDisabled()
  })

  it('送信すると createComment(p1, 本文) を呼び、成功で入力が空になる。通知は出ない', async () => {
    api.createComment.mockResolvedValue(makeComment('c1', 'こんにちは'))
    renderForm()
    const user = await typeBody('こんにちは')

    await user.click(submitButton())

    expect(api.createComment).toHaveBeenCalledWith('p1', 'こんにちは')
    expect(textbox()).toHaveValue('')
    expect(submitButton()).toBeDisabled()
    expect(screen.getByRole('status', { name: '通知' })).toBeEmptyDOMElement()
  })

  it('素早く 2 回送っても、createComment は 1 回だけ', async () => {
    api.createComment.mockReturnValue(new Promise(() => {}))
    renderForm()
    const user = await typeBody('こんにちは')

    await user.dblClick(submitButton())

    expect(api.createComment).toHaveBeenCalledTimes(1)
  })

  it('同じ tick で submit が 2 回届いても（ボタンが無効になる前）、createComment は 1 回だけ', async () => {
    api.createComment.mockReturnValue(new Promise(() => {}))
    renderForm()
    await typeBody('こんにちは')
    const form = submitButton().closest('form')!

    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })

    // mutate は非同期に createComment を呼ぶ。1 回目が呼ばれるのを待ち、2 回目が来る余地を流してから数える。
    await waitFor(() => expect(api.createComment).toHaveBeenCalled())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(api.createComment).toHaveBeenCalledTimes(1)
  })

  it('送信中はボタンが無効', async () => {
    api.createComment.mockReturnValue(new Promise(() => {}))
    renderForm()
    const user = await typeBody('こんにちは')

    await user.click(submitButton())

    expect(submitButton()).toBeDisabled()
  })

  it('422 の body の誤りは入力欄の下に出て、入力が残る。入力を変えると誤りが消える', async () => {
    api.createComment.mockRejectedValue(
      apiError({
        status: 422,
        detail: '入力内容に誤りがあります',
        errors: [{ field: 'body', message: '使えない文字が含まれています' }],
      }),
    )
    renderForm()
    const user = await typeBody('こんにちは')

    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('使えない文字が含まれています')
    expect(textbox()).toHaveAttribute('aria-invalid', 'true')
    expect(textbox()).toHaveValue('こんにちは')

    await user.type(textbox(), 'あ')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(textbox()).not.toHaveAttribute('aria-invalid')
  })

  it('body の誤りが無い 422 は、detail がフォームの上に出て、入力が残る', async () => {
    api.createComment.mockRejectedValue(apiError({ status: 422, detail: '入力内容に誤りがあります', errors: [] }))
    renderForm()
    const user = await typeBody('こんにちは')

    await user.click(submitButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('入力内容に誤りがあります')
    expect(textbox()).not.toHaveAttribute('aria-invalid')
    expect(textbox()).toHaveValue('こんにちは')
  })

  it('500 は ID 付きの文言を通知し、入力が残る', async () => {
    api.createComment.mockRejectedValue(apiError({ status: 500, requestId: 'req-1' }))
    const { onPostGone } = renderForm()
    const user = await typeBody('こんにちは')

    await user.click(submitButton())

    expect(await screen.findByText(/req-1/)).toBeInTheDocument()
    expect(textbox()).toHaveValue('こんにちは')
    expect(onPostGone).not.toHaveBeenCalled()
  })

  it('404 は「見つかりません」を通知し、onPostGone が呼ばれる', async () => {
    api.createComment.mockRejectedValue(apiError({ status: 404, code: 'NOT_FOUND', detail: '見つかりません' }))
    const { onPostGone } = renderForm()
    const user = await typeBody('こんにちは')

    await user.click(submitButton())

    expect(await screen.findByText('見つかりません')).toBeInTheDocument()
    expect(onPostGone).toHaveBeenCalledTimes(1)
  })

  it('404 では、onPostGone を呼ぶ時点で、その投稿がタイムラインのキャッシュから除かれている', async () => {
    api.createComment.mockRejectedValue(apiError({ status: 404, code: 'NOT_FOUND', detail: '見つかりません' }))
    const onPostGone = vi.fn()
    let itemIdsWhenGone: string[] = []
    const { queryClient } = renderWithProviders(<CommentForm postId="p1" onPostGone={onPostGone} />)
    onPostGone.mockImplementation(() => {
      const data = queryClient.getQueryData<InfiniteData<Page<Post>, string | null>>(timelineKeys.all)
      itemIdsWhenGone = data?.pages.flatMap((page) => page.items.map((item) => item.id)) ?? []
    })
    const data: InfiniteData<Page<Post>, string | null> = {
      pages: [{ items: [makePost('p1'), makePost('p2')], nextCursor: null }],
      pageParams: [null],
    }
    queryClient.setQueryData(timelineKeys.all, data)
    const user = await typeBody('こんにちは')

    await user.click(submitButton())

    expect(await screen.findByText('見つかりません')).toBeInTheDocument()
    expect(onPostGone).toHaveBeenCalledTimes(1)
    expect(itemIdsWhenGone).toEqual(['p2'])
  })
})
