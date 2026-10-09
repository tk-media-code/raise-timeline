import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import type { Post } from '../../api/posts'
import { renderWithProviders } from '../../test/providers'
import { ComposeDialog } from './ComposeDialog'

const api = vi.hoisted(() => ({ createPost: vi.fn(), updatePost: vi.fn(), deletePost: vi.fn() }))
vi.mock('../../api/posts', () => api)

const created: Post = {
  id: 'new',
  author: { id: 'u1', username: 'alice', displayName: 'アリス', avatarUrl: null },
  body: 'こんにちは',
  images: [],
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  edited: false,
  createdAt: '2026-10-06T05:09:00Z',
}

// 親の状態で開閉する（実際の AppLayout と同じ）。
function Harness() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        ひらく
      </button>
      <ComposeDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

describe('ComposeDialog', () => {
  beforeEach(() => {
    api.createPost.mockReset()
  })

  it('見出し「新しい投稿」を出し、「閉じる」と Esc で閉じる', async () => {
    const onClose = vi.fn()
    renderWithProviders(<ComposeDialog open onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: '新しい投稿' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(screen.getByRole('dialog'), cancel)

    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('送信中でも閉じられ、そのあと失敗したら通知だけで伝える', async () => {
    let reject!: (error: unknown) => void
    api.createPost.mockReturnValue(new Promise<Post>((_resolve, r) => (reject = r)))
    renderWithProviders(<Harness />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('textbox', { name: '本文' }))
    await user.paste('こんにちは')
    await user.click(screen.getByRole('button', { name: '投稿する' }))

    await user.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    reject(
      new ApiError({
        status: 422,
        code: null,
        detail: '入力内容に誤りがあります',
        errors: [{ field: 'body', message: '使えない文字が含まれています' }],
        requestId: null,
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('使えない文字が含まれています')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('送信中に閉じて開き直したあと、前の送信が成功しても、開き直したダイアログは閉じない', async () => {
    let resolve!: (post: Post) => void
    api.createPost.mockReturnValue(new Promise<Post>((r) => (resolve = r)))
    renderWithProviders(<Harness />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('textbox', { name: '本文' }))
    await user.paste('こんにちは')
    await user.click(screen.getByRole('button', { name: '投稿する' }))
    await user.click(screen.getByRole('button', { name: '閉じる' }))
    await user.click(screen.getByRole('button', { name: 'ひらく' }))
    expect(screen.getByRole('dialog', { name: '新しい投稿' })).toBeInTheDocument()

    resolve(created)

    expect(await screen.findByText('投稿しました')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '新しい投稿' })).toBeInTheDocument()
  })
})
