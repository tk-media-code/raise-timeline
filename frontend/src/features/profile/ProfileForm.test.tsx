import { useQuery } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Me } from '../../api/auth'
import { ApiError } from '../../api/client'
import type { UserDetail } from '../../api/users'
import { createQueryClient } from '../../lib/queryClient'
import { renderWithProviders } from '../../test/providers'
import { postKey, timelineKeys, userPostsKeys } from '../posts/queryKeys'
import { ProfileForm } from './ProfileForm'
import { meKey, userKey } from './queryKeys'

const api = vi.hoisted(() => ({ getMe: vi.fn(), updateMe: vi.fn(), updateAvatar: vi.fn() }))
vi.mock('../../api/users', () => api)

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../auth/AuthProvider', () => ({ useAuth }))

const updateUser = vi.fn()
const updateAvatarUrl = vi.fn()

function makeMe(overrides: Partial<Me> = {}): Me {
  return {
    id: 'u1',
    username: 'Alice',
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

// 大きさは中身を作らずに size だけ差し替える。
function makeImage(name = 'icon.png', type = 'image/png', size = 100): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

// ProfileEditPage と同じく、フォームには meKey のキャッシュを渡す（キャッシュが変わると、アイコンだけが変わる）。
function Harness() {
  const query = useQuery({ queryKey: meKey, queryFn: api.getMe, gcTime: 0, staleTime: Infinity })
  return query.data ? <ProfileForm me={query.data} /> : null
}

// 通知の置き場所（ToastProvider）は残したまま、フォームだけを消せる。
function Closable() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(false)}>
        閉じる
      </button>
      {open && <Harness />}
    </>
  )
}

async function openForm(me = makeMe()) {
  const queryClient = createQueryClient()
  queryClient.setQueryData(meKey, me)
  const rendered = renderWithProviders(<Harness />, { queryClient })
  await screen.findByRole('button', { name: '保存' })
  // accept による絞り込みを切る。SVG のように「選べてしまった」ファイルを画面が自分で断ることを確かめるため。
  return { ...rendered, queryClient, user: userEvent.setup({ applyAccept: false }) }
}

const fileInput = () => screen.getByLabelText('アイコンの画像')
const saveButton = () => screen.getByRole('button', { name: '保存' })
const changeButton = () => screen.getByRole('button', { name: '画像を変更' })
const avatarImg = (container: HTMLElement) => container.querySelector('form img')

describe('ProfileForm のアイコン', () => {
  beforeEach(() => {
    api.getMe.mockReset()
    api.updateAvatar.mockReset()
    api.updateMe.mockReset()
    updateUser.mockReset()
    updateAvatarUrl.mockReset()
    useAuth.mockReturnValue({ status: 'authenticated', user: makeMe(), updateUser, updateAvatarUrl })
  })

  it('「画像を変更」を押すと、ファイル選択を開く', async () => {
    const { user } = await openForm()
    const click = vi.spyOn(fileInput() as HTMLInputElement, 'click')

    await user.click(changeButton())

    expect(click).toHaveBeenCalledTimes(1)
  })

  it('ファイルを選ぶと updateAvatar が呼ばれ、返った URL のアイコンになる', async () => {
    api.updateAvatar.mockResolvedValue({ avatarUrl: 'https://img.example.com/new.png' })
    const { user, container } = await openForm()
    const file = makeImage()
    expect(avatarImg(container)).not.toBeInTheDocument()

    await user.upload(fileInput(), file)

    expect(api.updateAvatar).toHaveBeenCalledWith(file)
    await waitFor(() => expect(avatarImg(container)).toHaveAttribute('src', 'https://img.example.com/new.png'))
    expect(updateAvatarUrl).toHaveBeenCalledWith('u1', 'https://img.example.com/new.png')
  })

  it('成功したら、自分・プロフィール・一覧のキャッシュを直す。成功の通知は出ない', async () => {
    api.updateAvatar.mockResolvedValue({ avatarUrl: 'https://img.example.com/new.png' })
    const { user, queryClient } = await openForm()
    const detail: UserDetail = (({ email: _email, ...rest }) => rest)(makeMe())
    queryClient.setQueryData(userKey('alice'), detail)
    queryClient.setQueryData(timelineKeys.all, { pages: [], pageParams: [] })
    queryClient.setQueryData(userPostsKeys.of('alice'), { pages: [], pageParams: [] })
    queryClient.setQueryData(postKey('p1'), {})

    await user.upload(fileInput(), makeImage())

    await waitFor(() =>
      expect(queryClient.getQueryData<Me>(meKey)?.avatarUrl).toBe('https://img.example.com/new.png'),
    )
    expect(queryClient.getQueryData<UserDetail>(userKey('alice'))?.avatarUrl).toBe('https://img.example.com/new.png')
    expect(queryClient.getQueryState(timelineKeys.all)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(userPostsKeys.of('alice'))?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(postKey('p1'))?.isInvalidated).toBe(true)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: '通知' })).toBeEmptyDOMElement()
  })

  it('プロフィールのキャッシュが無ければ作らない', async () => {
    api.updateAvatar.mockResolvedValue({ avatarUrl: 'https://img.example.com/new.png' })
    const { user, queryClient } = await openForm()

    await user.upload(fileInput(), makeImage())

    await waitFor(() => expect(updateAvatarUrl).toHaveBeenCalled())
    expect(queryClient.getQueryData(userKey('alice'))).toBeUndefined()
  })

  it('送っている間は「画像を変更」と「保存」を押せない', async () => {
    const pending = deferred<{ avatarUrl: string }>()
    api.updateAvatar.mockReturnValue(pending.promise)
    const { user } = await openForm()
    // 表示名を変えて、アイコン以外の理由では「保存」が押せる状態にしておく。
    await user.type(screen.getByRole('textbox', { name: '表示名' }), 'a')
    expect(saveButton()).toBeEnabled()

    await user.upload(fileInput(), makeImage())

    expect(changeButton()).toBeDisabled()
    expect(saveButton()).toBeDisabled()

    pending.resolve({ avatarUrl: 'https://img.example.com/new.png' })
    await waitFor(() => expect(changeButton()).toBeEnabled())
    expect(saveButton()).toBeEnabled()
  })

  it('保存を送っている間は「画像を変更」を押せない（保存の応答が新しいアイコンを古いものに戻さないため）', async () => {
    const pending = deferred<Me>()
    api.updateMe.mockReturnValue(pending.promise)
    const { user } = await openForm()
    await user.type(screen.getByRole('textbox', { name: '表示名' }), 'a')
    expect(changeButton()).toBeEnabled()

    await user.click(saveButton())

    await waitFor(() => expect(api.updateMe).toHaveBeenCalled())
    expect(changeButton()).toBeDisabled()
    // 押せない間に選ばれても送らない。
    await user.upload(fileInput(), makeImage())
    expect(api.updateAvatar).not.toHaveBeenCalled()

    pending.resolve(makeMe({ displayName: 'アリスa' }))
  })

  it('入力途中の表示名は残り、元に戻すと「保存」を押せない', async () => {
    api.updateAvatar.mockResolvedValue({ avatarUrl: 'https://img.example.com/new.png' })
    const { user, container } = await openForm()
    const name = screen.getByRole('textbox', { name: '表示名' })
    await user.type(name, 'ス')

    await user.upload(fileInput(), makeImage())
    await waitFor(() => expect(avatarImg(container)).toHaveAttribute('src', 'https://img.example.com/new.png'))

    expect(name).toHaveValue('アリスス')
    expect(saveButton()).toBeEnabled()
    await user.type(name, '{Backspace}')
    expect(name).toHaveValue('アリス')
    expect(saveButton()).toBeDisabled()
  })

  it('3 MB の画像と SVG は、updateAvatar を呼ばずに欄の下へ文言を出す', async () => {
    const { user } = await openForm()

    await user.upload(fileInput(), makeImage('big.png', 'image/png', 3 * 1024 * 1024))
    expect(screen.getByRole('alert')).toHaveTextContent('画像は 2 MB 以内にしてください')

    await user.upload(fileInput(), makeImage('a.svg', 'image/svg+xml'))
    expect(screen.getByRole('alert')).toHaveTextContent('JPEG、PNG、GIF、WebP の画像を選んでください')

    expect(api.updateAvatar).not.toHaveBeenCalled()
  })

  it('413 は「画像は 2 MB 以内にしてください」を欄の下に出す。アイコンは変わらない', async () => {
    api.updateAvatar.mockRejectedValue(apiError({ status: 413, code: 'FILE_TOO_LARGE', detail: '画像が大きすぎます' }))
    const { user, container } = await openForm()

    await user.upload(fileInput(), makeImage())

    expect(await screen.findByRole('alert')).toHaveTextContent('画像は 2 MB 以内にしてください')
    expect(avatarImg(container)).not.toBeInTheDocument()
    expect(updateAvatarUrl).not.toHaveBeenCalled()
  })

  it('415 は形式の文言を欄の下に出す', async () => {
    api.updateAvatar.mockRejectedValue(apiError({ status: 415, code: 'UNSUPPORTED_IMAGE_TYPE', detail: '形式が違います' }))
    const { user } = await openForm()

    await user.upload(fileInput(), makeImage())

    expect(await screen.findByRole('alert')).toHaveTextContent('JPEG、PNG、GIF、WebP の画像を選んでください')
  })

  it('422 は返った文言を欄の下に出す', async () => {
    api.updateAvatar.mockRejectedValue(
      apiError({ status: 422, detail: '入力内容に誤りがあります', errors: [{ field: 'file', message: '画像を読み取れませんでした' }] }),
    )
    const { user } = await openForm()

    await user.upload(fileInput(), makeImage())

    expect(await screen.findByRole('alert')).toHaveTextContent('画像を読み取れませんでした')
  })

  it('500 は通知になる（欄の下には出ない）', async () => {
    api.updateAvatar.mockRejectedValue(apiError({ status: 500, requestId: 'req-1' }))
    const { user } = await openForm()

    await user.upload(fileInput(), makeImage())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('問題が起きました（ID: req-1）')
    expect(alert.closest('form')).toBeNull()
  })

  it('次に選び直すと、前の文言が消える', async () => {
    api.updateAvatar.mockRejectedValueOnce(apiError({ status: 413, detail: '画像が大きすぎます' }))
    api.updateAvatar.mockResolvedValueOnce({ avatarUrl: 'https://img.example.com/new.png' })
    const { user } = await openForm()
    await user.upload(fileInput(), makeImage())
    await screen.findByRole('alert')

    await user.upload(fileInput(), makeImage('b.png'))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('送信中にフォームが消えたあとの失敗は、種類によらず通知で伝える', async () => {
    const pending = deferred<{ avatarUrl: string }>()
    api.updateAvatar.mockReturnValue(pending.promise)
    const queryClient = createQueryClient()
    queryClient.setQueryData(meKey, makeMe())
    renderWithProviders(<Closable />, { queryClient })
    const user = userEvent.setup({ applyAccept: false })
    await user.upload(fileInput(), makeImage())

    await user.click(screen.getByRole('button', { name: '閉じる' }))
    pending.reject(apiError({ status: 413, detail: '画像が大きすぎます' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('画像は 2 MB 以内にしてください')
  })
})
