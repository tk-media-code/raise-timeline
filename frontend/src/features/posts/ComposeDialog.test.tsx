import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('送信中は「閉じる」も Esc も効かず、投稿できたら閉じる', async () => {
    let resolve!: (post: Post) => void
    api.createPost.mockReturnValue(new Promise<Post>((r) => (resolve = r)))
    const onClose = vi.fn()
    renderWithProviders(<ComposeDialog open onClose={onClose} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('textbox', { name: '本文' }))
    await user.paste('こんにちは')

    await user.click(screen.getByRole('button', { name: '投稿する' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: '閉じる' })).toBeDisabled())
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).not.toHaveBeenCalled()

    resolve(created)

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})
