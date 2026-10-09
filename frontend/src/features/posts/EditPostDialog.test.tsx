import type { InfiniteData } from '@tanstack/react-query'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import type { Page, Post } from '../../api/posts'
import { createQueryClient } from '../../lib/queryClient'
import { renderWithProviders } from '../../test/providers'
import { EditPostDialog } from './EditPostDialog'
import { postKey, timelineKeys } from './queryKeys'

const api = vi.hoisted(() => ({ createPost: vi.fn(), updatePost: vi.fn(), deletePost: vi.fn() }))
vi.mock('../../api/posts', () => api)

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

function seed(post: Post) {
  const queryClient = createQueryClient()
  const data: Data = { pages: [{ items: [post], nextCursor: null }], pageParams: [null] }
  queryClient.setQueryData(timelineKeys.all, data)
  queryClient.setQueryData(postKey(post.id), post)
  return queryClient
}

function renderDialog(options: { post?: Post; queryClient?: ReturnType<typeof createQueryClient> } = {}) {
  const onClose = vi.fn()
  const onRemoved = vi.fn()
  const post = options.post ?? makePost()
  const result = renderWithProviders(<EditPostDialog post={post} open onClose={onClose} onRemoved={onRemoved} />, {
    queryClient: options.queryClient,
  })
  return { ...result, onClose, onRemoved }
}

async function replaceBody(text: string) {
  const user = userEvent.setup()
  const textbox = screen.getByRole('textbox', { name: '本文' })
  await user.clear(textbox)
  await user.click(textbox)
  await user.paste(text)
  return user
}

describe('EditPostDialog', () => {
  beforeEach(() => {
    api.updatePost.mockReset()
  })

  it('見出し「投稿を編集」と元の本文が出て、元と同じなら「保存」を押せない', () => {
    renderDialog()

    expect(screen.getByRole('dialog', { name: '投稿を編集' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('元の本文')
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('開いていないときは、中身を描かない', () => {
    renderWithProviders(<EditPostDialog post={makePost()} open={false} onClose={() => {}} />)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('変えると押せる。281 文字では押せない', async () => {
    renderDialog()

    await replaceBody('直した本文')
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()

    await replaceBody('あ'.repeat(281))
    expect(screen.getByText('残り -1 文字')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('空にすると押せない', async () => {
    renderDialog()

    await replaceBody('')

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('保存で updatePost(id, 本文) を呼び、閉じ、キャッシュが新しい本文になる', async () => {
    const queryClient = seed(makePost())
    api.updatePost.mockResolvedValue(makePost({ body: '直した本文', edited: true }))
    const { onClose } = renderDialog({ queryClient })
    const user = await replaceBody('直した本文')

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(api.updatePost).toHaveBeenCalledWith('p1', '直した本文')
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    const data = queryClient.getQueryData<Data>(timelineKeys.all)
    expect(data?.pages[0]?.items[0]?.body).toBe('直した本文')
    expect(data?.pages[0]?.items[0]?.edited).toBe(true)
    expect(queryClient.getQueryData<Post>(postKey('p1'))?.body).toBe('直した本文')
    // 編集の成功は通知しない。
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('保存を 2 回押しても updatePost は 1 回', async () => {
    api.updatePost.mockReturnValue(new Promise(() => {}))
    renderDialog()
    const user = await replaceBody('直した本文')

    await user.dblClick(screen.getByRole('button', { name: '保存' }))

    expect(api.updatePost).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('「取り消し」と Esc では、何も送らずに閉じる', async () => {
    const { onClose } = renderDialog()
    const user = await replaceBody('直した本文')

    await user.click(screen.getByRole('button', { name: '取り消し' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(screen.getByRole('dialog'), cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(api.updatePost).not.toHaveBeenCalled()
  })

  it('保存中に閉じられたあと失敗したら、通知だけで伝える', async () => {
    let reject!: (error: unknown) => void
    api.updatePost.mockReturnValue(new Promise((_resolve, r) => (reject = r)))
    function Harness() {
      const [open, setOpen] = useState(true)
      return <EditPostDialog post={makePost()} open={open} onClose={() => setOpen(false)} />
    }
    renderWithProviders(<Harness />)
    const user = await replaceBody('直した本文')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await user.click(screen.getByRole('button', { name: '取り消し' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    reject(apiError({ status: 422, detail: '入力内容に誤りがあります', errors: [{ field: 'body', message: '使えない文字が含まれています' }] }))

    expect(await screen.findByRole('alert')).toHaveTextContent('使えない文字が含まれています')
  })

  it('422 の誤りは欄の下に出て、ダイアログは閉じない', async () => {
    api.updatePost.mockRejectedValue(
      apiError({ status: 422, detail: '入力内容に誤りがあります', errors: [{ field: 'body', message: '使えない文字が含まれています' }] }),
    )
    const { onClose } = renderDialog()
    const user = await replaceBody('直した本文')

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('使えない文字が含まれています')
    expect(screen.getByRole('textbox', { name: '本文' })).toHaveAccessibleDescription(
      expect.stringContaining('使えない文字が含まれています'),
    )
    expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('直した本文')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('403 は「この操作はできません」の通知で、閉じる', async () => {
    api.updatePost.mockRejectedValue(apiError({ status: 403, detail: 'この操作はできません' }))
    const { onClose, onRemoved } = renderDialog({ queryClient: seed(makePost()) })
    const user = await replaceBody('直した本文')

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('この操作はできません')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onRemoved).not.toHaveBeenCalled()
  })

  it('404 は「見つかりません」の通知で、キャッシュから除いて閉じる', async () => {
    api.updatePost.mockRejectedValue(apiError({ status: 404, detail: '見つかりません' }))
    const queryClient = seed(makePost())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { onClose, onRemoved } = renderDialog({ queryClient })
    const user = await replaceBody('直した本文')

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('見つかりません')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onRemoved).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData<Data>(timelineKeys.all)?.pages[0]?.items).toEqual([])
    expect(queryClient.getQueryData(postKey('p1'))).toBeUndefined()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: timelineKeys.root })
  })

  it('500 は requestId を含む通知になり、ダイアログは閉じず入力も残る', async () => {
    api.updatePost.mockRejectedValue(apiError({ status: 500, requestId: 'req-9' }))
    const { onClose } = renderDialog()
    const user = await replaceBody('直した本文')

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('問題が起きました（ID: req-9）')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('直した本文')
  })
})
