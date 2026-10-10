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

// 大きさは中身を作らずに size だけ差し替える。
function makeImage(name = 'a.png', type = 'image/png', size = 100): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

// accept による絞り込みを切る。SVG のように「選べてしまった」ファイルを画面が自分で断ることを確かめるため。
function setupUser() {
  return userEvent.setup({ applyAccept: false })
}

const fileInput = () => screen.getByLabelText('投稿に付ける画像')

async function pickImages(user: ReturnType<typeof setupUser>, ...files: File[]) {
  await user.upload(fileInput(), files)
}

async function typeBody(text: string) {
  const user = setupUser()
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
    expect(api.createPost).toHaveBeenCalledWith('こんにちは', [])
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

  describe('画像', () => {
    const IMAGE_TYPE_MESSAGE = 'JPEG、PNG、GIF、WebP の画像を選んでください'

    it('選ぶとプレビュー「選んだ画像 1」が出て、「画像 1 を取り消す」で消え、プレビューの URL を解放する', async () => {
      const revoke = vi.spyOn(URL, 'revokeObjectURL')
      renderWithProviders(<PostForm id="test-form" />)
      const user = setupUser()

      await pickImages(user, makeImage())

      const preview = screen.getByRole('img', { name: '選んだ画像 1' })
      const previewUrl = preview.getAttribute('src')
      expect(previewUrl).toMatch(/^blob:/)

      await user.click(screen.getByRole('button', { name: '画像 1 を取り消す' }))

      expect(screen.queryByRole('img', { name: '選んだ画像 1' })).not.toBeInTheDocument()
      expect(revoke).toHaveBeenCalledWith(previewUrl)
      revoke.mockRestore()
    })

    it('画像の一覧と誤りの文言は、「画像を追加」と「投稿する」の行より前にある', async () => {
      renderWithProviders(<PostForm id="test-form" />)
      const user = setupUser()

      await pickImages(user, makeImage(), makeImage('a.svg', 'image/svg+xml'))

      const preview = screen.getByRole('img', { name: '選んだ画像 1' })
      const alert = screen.getByRole('alert')
      const add = screen.getByRole('button', { name: '画像を追加' })
      const submit = screen.getByRole('button', { name: '投稿する' })
      const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
      expect(follows(screen.getByRole('textbox', { name: '本文' }), preview)).toBe(true)
      expect(follows(preview, alert)).toBe(true)
      expect(follows(alert, add)).toBe(true)
      expect(follows(add, submit)).toBe(true)
      // 誤りの文言は「画像を追加」の説明として読み上げられる。
      expect(add).toHaveAccessibleDescription(IMAGE_TYPE_MESSAGE)
    })

    it('同じファイルを続けて選んでも、もう一度足せる（選び終えたら入力を空にする）', async () => {
      renderWithProviders(<PostForm id="test-form" />)
      const user = setupUser()
      const file = makeImage()

      await pickImages(user, file)
      await pickImages(user, file)

      expect(screen.getAllByRole('img')).toHaveLength(2)
    })

    it('「画像を追加」を押すと、ファイル選択を開く', async () => {
      renderWithProviders(<PostForm id="test-form" />)
      const user = setupUser()
      const click = vi.spyOn(fileInput() as HTMLInputElement, 'click')

      await user.click(screen.getByRole('button', { name: '画像を追加' }))

      expect(click).toHaveBeenCalledTimes(1)
    })

    it('3 枚ある所に 2 枚選ぶと 4 枚になり、「画像は 4 枚までです」が出る', async () => {
      renderWithProviders(<PostForm id="test-form" />)
      const user = setupUser()
      await pickImages(user, makeImage('1.png'), makeImage('2.png'), makeImage('3.png'))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()

      await pickImages(user, makeImage('4.png'), makeImage('5.png'))

      expect(screen.getAllByRole('img')).toHaveLength(4)
      expect(screen.getByRole('alert')).toHaveTextContent('画像は 4 枚までです')
    })

    it('4 枚のときも「画像を追加」は押せ、5 枚目を選ぶと文言が出る。取り消すと文言が消える', async () => {
      renderWithProviders(<PostForm id="test-form" />)
      const user = setupUser()
      await pickImages(user, makeImage('1.png'), makeImage('2.png'), makeImage('3.png'), makeImage('4.png'))
      expect(screen.getByRole('button', { name: '画像を追加' })).toBeEnabled()

      await pickImages(user, makeImage('5.png'))
      expect(screen.getByRole('alert')).toHaveTextContent('画像は 4 枚までです')
      expect(screen.getAllByRole('img')).toHaveLength(4)

      await user.click(screen.getByRole('button', { name: '画像 4 を取り消す' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('次の選択が成功すると、前の文言が消える', async () => {
      renderWithProviders(<PostForm id="test-form" />)
      const user = setupUser()
      await pickImages(user, makeImage('a.svg', 'image/svg+xml'))
      expect(screen.getByRole('alert')).toBeInTheDocument()

      await pickImages(user, makeImage())

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('10 MB の画像と SVG は、選んだ時点で文言が出て、足されない', async () => {
      renderWithProviders(<PostForm id="test-form" />)
      const user = setupUser()

      await pickImages(user, makeImage('big.png', 'image/png', 10 * 1024 * 1024))
      expect(screen.getByRole('alert')).toHaveTextContent('画像は 5 MB 以内にしてください')
      expect(screen.queryByRole('img')).not.toBeInTheDocument()

      await pickImages(user, makeImage('a.svg', 'image/svg+xml'))
      expect(screen.getByRole('alert')).toHaveTextContent(IMAGE_TYPE_MESSAGE)
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '投稿する' })).toBeDisabled()
    })

    it('合わないファイルが混ざっていても、通るものは足される', async () => {
      renderWithProviders(<PostForm id="test-form" />)
      const user = setupUser()

      await pickImages(user, makeImage('a.svg', 'image/svg+xml'), makeImage('b.png'))

      expect(screen.getAllByRole('img')).toHaveLength(1)
      expect(screen.getByRole('alert')).toHaveTextContent(IMAGE_TYPE_MESSAGE)
    })

    it('本文が空でも画像があれば「投稿する」を押せ、createPost(\'\', [file]) で呼ばれる', async () => {
      api.createPost.mockResolvedValue(makePost('new', ''))
      renderWithProviders(<PostForm id="test-form" />)
      const user = setupUser()
      const file = makeImage()
      expect(screen.getByRole('button', { name: '投稿する' })).toBeDisabled()

      await pickImages(user, file)
      await user.click(screen.getByRole('button', { name: '投稿する' }))

      expect(api.createPost).toHaveBeenCalledWith('', [file])
    })

    it('画像は選んだ順で送る', async () => {
      api.createPost.mockResolvedValue(makePost('new', 'x'))
      renderWithProviders(<PostForm id="test-form" />)
      const user = await typeBody('x')
      const first = makeImage('1.png')
      const second = makeImage('2.png')

      await pickImages(user, first, second)
      await user.click(screen.getByRole('button', { name: '投稿する' }))

      expect(api.createPost).toHaveBeenCalledWith('x', [first, second])
    })

    it('成功すると本文と画像が空になり、プレビューの URL を解放する', async () => {
      const revoke = vi.spyOn(URL, 'revokeObjectURL')
      api.createPost.mockResolvedValue(makePost('new', 'こんにちは'))
      renderWithProviders(<PostForm id="test-form" />)
      const user = await typeBody('こんにちは')
      await pickImages(user, makeImage())
      const previewUrl = screen.getByRole('img', { name: '選んだ画像 1' }).getAttribute('src')

      await user.click(screen.getByRole('button', { name: '投稿する' }))

      expect(await screen.findByText('投稿しました')).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('')
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(revoke).toHaveBeenCalledWith(previewUrl)
      revoke.mockRestore()
    })

    it('フォームが消えるとき、プレビューの URL を解放する', async () => {
      const revoke = vi.spyOn(URL, 'revokeObjectURL')
      const { unmount } = renderWithProviders(<PostForm id="test-form" />)
      const user = setupUser()
      await pickImages(user, makeImage())
      const previewUrl = screen.getByRole('img', { name: '選んだ画像 1' }).getAttribute('src')
      revoke.mockClear()

      unmount()

      expect(revoke).toHaveBeenCalledWith(previewUrl)
      revoke.mockRestore()
    })

    it('送信中は「画像を追加」と取り消しを押せない', async () => {
      api.createPost.mockReturnValue(new Promise(() => {}))
      renderWithProviders(<PostForm id="test-form" />)
      const user = await typeBody('こんにちは')
      await pickImages(user, makeImage())

      await user.click(screen.getByRole('button', { name: '投稿する' }))

      expect(screen.getByRole('button', { name: '画像を追加' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '画像 1 を取り消す' })).toBeDisabled()
    })

    it('422 で images の誤りがあれば、画像の欄の下に出る。本文と画像は残る', async () => {
      api.createPost.mockRejectedValue(
        apiError({ status: 422, detail: '入力内容に誤りがあります', errors: [{ field: 'images', message: '画像を読み取れませんでした' }] }),
      )
      renderWithProviders(<PostForm id="test-form" />)
      const user = await typeBody('こんにちは')
      await pickImages(user, makeImage())

      await user.click(screen.getByRole('button', { name: '投稿する' }))

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('画像を読み取れませんでした')
      expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('こんにちは')
      expect(screen.getByRole('textbox', { name: '本文' })).not.toHaveAttribute('aria-invalid')
      expect(screen.getByRole('img', { name: '選んだ画像 1' })).toBeInTheDocument()
    })

    it('413 は「画像は 5 MB 以内にしてください」を画像の欄の下に出す。本文と画像は残る', async () => {
      api.createPost.mockRejectedValue(apiError({ status: 413, code: 'FILE_TOO_LARGE', detail: '画像が大きすぎます' }))
      renderWithProviders(<PostForm id="test-form" />)
      const user = await typeBody('こんにちは')
      await pickImages(user, makeImage())

      await user.click(screen.getByRole('button', { name: '投稿する' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('画像は 5 MB 以内にしてください')
      expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('こんにちは')
      expect(screen.getByRole('img', { name: '選んだ画像 1' })).toBeInTheDocument()
    })

    it('415 は形式の文言を画像の欄の下に出す', async () => {
      api.createPost.mockRejectedValue(apiError({ status: 415, code: 'UNSUPPORTED_IMAGE_TYPE', detail: '形式が違います' }))
      renderWithProviders(<PostForm id="test-form" />)
      const user = await typeBody('こんにちは')
      await pickImages(user, makeImage())

      await user.click(screen.getByRole('button', { name: '投稿する' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(IMAGE_TYPE_MESSAGE)
      expect(screen.getByRole('img', { name: '選んだ画像 1' })).toBeInTheDocument()
    })

    it('500 は通知になり、本文と画像は残る', async () => {
      api.createPost.mockRejectedValue(apiError({ status: 500, requestId: 'req-1' }))
      renderWithProviders(<PostForm id="test-form" />)
      const user = await typeBody('こんにちは')
      await pickImages(user, makeImage())

      await user.click(screen.getByRole('button', { name: '投稿する' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('問題が起きました（ID: req-1）')
      expect(screen.getByRole('textbox', { name: '本文' })).toHaveValue('こんにちは')
      expect(screen.getByRole('img', { name: '選んだ画像 1' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '画像を追加' })).toBeEnabled()
    })

    it('失敗のあとは、次の送信の前に画像の欄の誤りを消す', async () => {
      api.createPost
        .mockRejectedValueOnce(apiError({ status: 413, detail: '画像が大きすぎます' }))
        .mockReturnValueOnce(new Promise(() => {}))
      renderWithProviders(<PostForm id="test-form" />)
      const user = await typeBody('こんにちは')
      await pickImages(user, makeImage())
      await user.click(screen.getByRole('button', { name: '投稿する' }))
      await screen.findByRole('alert')

      await waitFor(() => expect(screen.getByRole('button', { name: '投稿する' })).toBeEnabled())
      await user.click(screen.getByRole('button', { name: '投稿する' }))

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
