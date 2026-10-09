import { onlineManager } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Me } from '../api/auth'
import { ApiError } from '../api/client'
import { postKey, timelineKeys, userPostsKeys } from '../features/posts/queryKeys'
import { meKey, userKey } from '../features/profile/queryKeys'
import { createQueryClient } from '../lib/queryClient'
import { renderWithProviders } from '../test/providers'
import ProfileEditPage from './ProfileEditPage'

const api = vi.hoisted(() => ({ getUser: vi.fn(), getUserPosts: vi.fn(), getMe: vi.fn(), updateMe: vi.fn() }))
vi.mock('../api/users', () => api)

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../auth/AuthProvider', () => ({ useAuth }))

const updateUser = vi.fn()

function makeMe(overrides: Partial<Me> = {}): Me {
  return {
    id: 'u1',
    username: 'alice',
    displayName: 'アリス',
    avatarUrl: null,
    bio: 'よろしく',
    isFollowing: false,
    followersCount: 0,
    followingCount: 0,
    createdAt: '2026-10-01T00:00:00Z',
    isMe: true,
    email: 'alice@example.com',
    ...overrides,
  }
}

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderEdit(options: Parameters<typeof renderWithProviders>[1] = {}) {
  return renderWithProviders(
    <>
      <Link to="/elsewhere">離れる</Link>
      <ProfileEditPage />
    </>,
    { route: '/settings/profile', path: '/settings/profile', ...options },
  )
}

async function openForm(options: Parameters<typeof renderWithProviders>[1] = {}) {
  const rendered = renderEdit(options)
  await screen.findByRole('heading', { level: 1, name: 'プロフィール編集' })
  return { ...rendered, user: userEvent.setup() }
}

const saveButton = () => screen.getByRole('button', { name: '保存' })
const nameInput = () => screen.getByRole('textbox', { name: '表示名' })
const bioInput = () => screen.getByRole('textbox', { name: '自己紹介' })

async function replaceText(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, text: string) {
  await user.clear(input)
  if (text !== '') await user.paste(text)
}

describe('ProfileEditPage', () => {
  beforeEach(() => {
    api.getMe.mockReset()
    api.updateMe.mockReset()
    updateUser.mockReset()
    api.getMe.mockResolvedValue(makeMe())
    useAuth.mockReturnValue({ status: 'authenticated', user: makeMe(), updateUser })
  })

  describe('表示', () => {
    it('開くと getMe を呼び、取れるまで読み込み中になる', async () => {
      const pending = deferred<Me>()
      api.getMe.mockReturnValue(pending.promise)
      renderEdit()

      expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
      expect(api.getMe).toHaveBeenCalledTimes(1)

      pending.resolve(makeMe())
      expect(await screen.findByRole('heading', { level: 1, name: 'プロフィール編集' })).toBeInTheDocument()
    })

    it('表示名と自己紹介が入っていて、ユーザー名とメールアドレスは文字で出る（入力欄ではない）', async () => {
      await openForm()

      expect(nameInput()).toHaveValue('アリス')
      expect(bioInput()).toHaveValue('よろしく')
      expect(screen.getByText('@alice')).toBeInTheDocument()
      expect(screen.getByText('alice@example.com')).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'ユーザー名' })).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'メールアドレス' })).not.toBeInTheDocument()
      expect(screen.getAllByRole('textbox')).toHaveLength(2)
    })

    it('アイコンのプレビューと「画像を変更」はあるが、「退会」は無い（退会は後の Issue）', async () => {
      await openForm()

      expect(screen.getByText('アイコン')).toBeInTheDocument()
      // 表示名の頭文字が丸に出る（Avatar は装飾なので、文字で探す）。
      expect(screen.getByText('ア')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '画像を変更' })).toBeEnabled()
      expect(screen.queryByText('退会')).not.toBeInTheDocument()
    })

    it('表示名を入力しても、アイコンのプレビューの頭文字は変わらない', async () => {
      const { user } = await openForm()

      await replaceText(user, nameInput(), ' ボブ')

      expect(screen.getByText('ア')).toBeInTheDocument()
      expect(screen.queryByText('ボ')).not.toBeInTheDocument()
    })

    it('開いている間に再接続などが起きても、取り直さない（触っていない項目で保存が押せるようにならない）', async () => {
      await openForm()

      // オフラインからオンラインへの切り替えが、再接続時の取り直し（refetchOnReconnect）の合図。
      onlineManager.setOnline(false)
      onlineManager.setOnline(true)
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(api.getMe).toHaveBeenCalledTimes(1)
      expect(saveButton()).toBeDisabled()
    })

    it('一度離れて開き直すと、もう一度 getMe を呼び、取れるまで前の値を見せない', async () => {
      const queryClient = createQueryClient()
      const first = await openForm({ queryClient })
      first.unmount()
      // gcTime: 0 の掃除を待つ。
      await new Promise((resolve) => setTimeout(resolve, 20))
      const pending = deferred<Me>()
      api.getMe.mockReturnValue(pending.promise)

      renderEdit({ queryClient })

      expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: '表示名' })).not.toBeInTheDocument()
      expect(api.getMe).toHaveBeenCalledTimes(2)
    })

    it('getMe が失敗したら「読み込みに失敗しました」と「再試行」が出て、押すと読み直す', async () => {
      api.getMe.mockRejectedValueOnce(apiError({ status: 500 }))
      renderEdit()
      const user = userEvent.setup()

      expect(await screen.findByText('読み込みに失敗しました')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '再試行' }))

      expect(await screen.findByRole('textbox', { name: '表示名' })).toBeInTheDocument()
      expect(api.getMe).toHaveBeenCalledTimes(2)
    })

    it('見出しはスマホ幅では見た目で隠し、読み上げ用に残す', async () => {
      await openForm()

      expect(screen.getByRole('heading', { level: 1, name: 'プロフィール編集' })).toHaveClass('max-md:sr-only')
    })
  })

  describe('「保存」を押せる条件', () => {
    it('何も変えていないと押せない。変えると押せ、元に戻すと押せない', async () => {
      const { user } = await openForm()
      expect(saveButton()).toBeDisabled()

      await user.type(nameInput(), 'さん')
      expect(saveButton()).toBeEnabled()

      await user.type(nameInput(), '{Backspace}{Backspace}')
      expect(saveButton()).toBeDisabled()

      await user.type(bioInput(), '！')
      expect(saveButton()).toBeEnabled()
    })

    it('自己紹介が 161 文字だと「残り -1 文字」が赤くなって押せず、160 文字なら押せる', async () => {
      const { user } = await openForm()

      await replaceText(user, bioInput(), '😀'.repeat(161))
      expect(screen.getByText('残り -1 文字')).toHaveClass('text-red-700')
      expect(saveButton()).toBeDisabled()

      await replaceText(user, bioInput(), '😀'.repeat(160))
      expect(screen.getByText('残り 0 文字')).not.toHaveClass('text-red-700')
      expect(saveButton()).toBeEnabled()
    })

    it('表示名を空白だけにして押すと、欄の下に誤りが出て、updateMe は呼ばれない', async () => {
      const { user } = await openForm()

      await replaceText(user, nameInput(), '   ')
      await user.click(saveButton())

      expect(screen.getByText('1〜50 文字で入力してください')).toBeInTheDocument()
      expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
      expect(api.updateMe).not.toHaveBeenCalled()
    })

    it('表示名を直すと、その欄の誤りはすぐ消え、そのまま送信できる', async () => {
      api.updateMe.mockReturnValue(new Promise(() => {}))
      const { user } = await openForm()
      await replaceText(user, nameInput(), '   ')
      await user.click(saveButton())

      expect(screen.getByText('1〜50 文字で入力してください')).toBeInTheDocument()

      await replaceText(user, nameInput(), '新しい名前')
      expect(screen.queryByText('1〜50 文字で入力してください')).not.toBeInTheDocument()
      await user.click(saveButton())

      expect(api.updateMe).toHaveBeenCalledTimes(1)
    })
  })

  describe('保存', () => {
    it('前後の空白を除いた表示名と、自己紹介をそのまま送る。成功したら通知し、差し替えと取り直しの印をして、プロフィールへ移る', async () => {
      const saved = makeMe({ displayName: '新しい名前', bio: ' こんにちは\n' })
      api.updateMe.mockResolvedValue(saved)
      const queryClient = createQueryClient()
      // 取り直しの印を確かめるため、種類の違う 3 つのキャッシュを先に置く（見ている画面が無いので取り直しは走らない）。
      queryClient.setQueryData(timelineKeys.all, { pages: [], pageParams: [] })
      queryClient.setQueryData(userPostsKeys.of('alice'), { pages: [], pageParams: [] })
      queryClient.setQueryData(postKey('p1'), { id: 'p1' })
      const { user } = await openForm({ queryClient })

      await replaceText(user, nameInput(), '  新しい名前  ')
      await replaceText(user, bioInput(), ' こんにちは\n')
      await user.click(saveButton())

      expect(await screen.findByText('現在地: /users/alice')).toBeInTheDocument()
      expect(api.updateMe).toHaveBeenCalledWith({ displayName: '新しい名前', bio: ' こんにちは\n' })
      expect(within(screen.getByRole('status', { name: '通知' })).getByText('保存しました')).toBeInTheDocument()
      expect(updateUser).toHaveBeenCalledWith(saved)
      // メールアドレスは他人にも見える形のキャッシュへは入れない。
      expect(queryClient.getQueryData(userKey('alice'))).toMatchObject({ displayName: '新しい名前', bio: ' こんにちは\n' })
      expect(queryClient.getQueryData(userKey('alice'))).not.toHaveProperty('email')
      expect(queryClient.getQueryState(timelineKeys.all)?.isInvalidated).toBe(true)
      expect(queryClient.getQueryState(userPostsKeys.of('alice'))?.isInvalidated).toBe(true)
      expect(queryClient.getQueryState(postKey('p1'))?.isInvalidated).toBe(true)
    })

    it('422 の誤りは項目の下に出て、入力は残る', async () => {
      api.updateMe.mockRejectedValue(
        apiError({
          status: 422,
          detail: '入力内容に誤りがあります',
          errors: [
            { field: 'displayName', message: '1〜50 文字で入力してください' },
            { field: 'bio', message: '使えない文字が含まれています' },
          ],
        }),
      )
      const { user } = await openForm()
      await replaceText(user, nameInput(), '新しい名前')

      await user.click(saveButton())

      expect(await screen.findByText('使えない文字が含まれています')).toBeInTheDocument()
      expect(screen.getByText('1〜50 文字で入力してください')).toBeInTheDocument()
      expect(screen.queryByText('入力内容に誤りがあります')).not.toBeInTheDocument()
      expect(nameInput()).toHaveValue('新しい名前')
      expect(bioInput()).toHaveValue('よろしく')
      expect(screen.queryByText(/現在地/)).not.toBeInTheDocument()
      expect(updateUser).not.toHaveBeenCalled()
    })

    it('項目に結べない 422 の誤りは、フォームの上部に detail を出す', async () => {
      api.updateMe.mockRejectedValue(
        apiError({ status: 422, detail: '入力内容に誤りがあります', errors: [{ field: 'other', message: 'x' }] }),
      )
      const { user } = await openForm()
      await replaceText(user, nameInput(), '新しい名前')

      await user.click(saveButton())

      expect(await screen.findByText('入力内容に誤りがあります')).toHaveAttribute('role', 'alert')
    })

    it('errors が空の 422 も、フォームの上部に detail を出す', async () => {
      api.updateMe.mockRejectedValue(apiError({ status: 422, detail: '入力内容に誤りがあります', errors: [] }))
      const { user } = await openForm()
      await replaceText(user, nameInput(), '新しい名前')

      await user.click(saveButton())

      expect(await screen.findByText('入力内容に誤りがあります')).toHaveAttribute('role', 'alert')
    })

    it('直して送り直すと、前の誤りは消える', async () => {
      api.updateMe.mockRejectedValueOnce(
        apiError({ status: 422, errors: [{ field: 'bio', message: '使えない文字が含まれています' }] }),
      )
      api.updateMe.mockResolvedValueOnce(makeMe({ displayName: '新しい名前' }))
      const { user } = await openForm()
      await replaceText(user, nameInput(), '新しい名前')
      await user.click(saveButton())
      await screen.findByText('使えない文字が含まれています')

      await user.click(saveButton())

      await screen.findByText('現在地: /users/alice')
      expect(screen.queryByText('使えない文字が含まれています')).not.toBeInTheDocument()
    })

    it('500 は requestId 付きの失敗の通知が出て、入力は残り、画面に留まる', async () => {
      api.updateMe.mockRejectedValue(apiError({ status: 500, detail: '問題が起きました', requestId: 'req-1' }))
      const { user } = await openForm()
      await replaceText(user, nameInput(), '新しい名前')

      await user.click(saveButton())

      expect(await screen.findByText('問題が起きました（ID: req-1）')).toBeInTheDocument()
      expect(nameInput()).toHaveValue('新しい名前')
      expect(screen.queryByText(/現在地/)).not.toBeInTheDocument()
      expect(updateUser).not.toHaveBeenCalled()
      expect(saveButton()).toBeEnabled()
    })

    it('素早く 2 回押しても updateMe は 1 回で、送信中は押せない', async () => {
      api.updateMe.mockReturnValue(new Promise(() => {}))
      const { user } = await openForm()
      await replaceText(user, nameInput(), '新しい名前')

      await user.dblClick(saveButton())

      expect(api.updateMe).toHaveBeenCalledTimes(1)
      expect(saveButton()).toBeDisabled()
    })

    it('送信中に画面を離れたら、成功しても移動しない。差し替えとキャッシュの更新は行う', async () => {
      const pending = deferred<Me>()
      api.updateMe.mockReturnValue(pending.promise)
      const saved = makeMe({ displayName: '新しい名前' })
      const { user, queryClient } = await openForm()
      await replaceText(user, nameInput(), '新しい名前')
      await user.click(saveButton())

      await user.click(screen.getByRole('link', { name: '離れる' }))
      expect(await screen.findByText('現在地: /elsewhere')).toBeInTheDocument()
      pending.resolve(saved)

      await waitFor(() => expect(updateUser).toHaveBeenCalledWith(saved))
      expect(queryClient.getQueryData(userKey('alice'))).toMatchObject({ displayName: '新しい名前' })
      expect(screen.getByText('現在地: /elsewhere')).toBeInTheDocument()
      expect(screen.queryByText('現在地: /users/alice')).not.toBeInTheDocument()
    })

    it('自分の情報のキャッシュは、使い終わったらすぐ捨てる（gcTime: 0）', async () => {
      const queryClient = createQueryClient()
      await openForm({ queryClient })

      expect(queryClient.getQueryCache().find({ queryKey: meKey })?.gcTime).toBe(0)
    })
  })
})
