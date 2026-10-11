import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { UserCard } from '../api/users'
import { ToastProvider } from '../components/Toast'
import { createQueryClient } from '../lib/queryClient'
import { renderWithProviders } from '../test/providers'
import SearchPage from './SearchPage'

const users = vi.hoisted(() => ({ searchUsers: vi.fn() }))
vi.mock('../api/users', () => users)

const follows = vi.hoisted(() => ({ followUser: vi.fn(), unfollowUser: vi.fn() }))
vi.mock('../api/follows', () => follows)

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../auth/AuthProvider', () => ({ useAuth }))

function makeCard(overrides: Partial<UserCard> = {}): UserCard {
  return { id: 'u2', username: 'bob', displayName: 'ボブ', avatarUrl: null, bio: '', isFollowing: false, ...overrides }
}

// 語 q に当たる 1 人。名前に語を入れて、どの語の結果か見分けられるようにする。
function cardFor(q: string): UserCard {
  return makeCard({ id: `id-${q}`, username: `user-${q}`, displayName: `結果-${q}` })
}

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// 場所を画面の外から見るための印。
function Probe() {
  const { pathname, search } = useLocation()
  return <p data-testid="location">{pathname + search}</p>
}

function Back() {
  const navigate = useNavigate()
  return (
    <>
      <button type="button" onClick={() => void navigate(-1)}>
        履歴を戻る
      </button>
      <button type="button" onClick={() => void navigate(1)}>
        履歴を進む
      </button>
    </>
  )
}

// 検索画面と、外からの移動に使う道具（リンク・戻る）を一緒に描く。
function Harness() {
  return (
    <>
      <SearchPage />
      <Probe />
      <Back />
      <Link to="/search">検索へ</Link>
      <Link to="/search?q=bob">ボブで検索</Link>
    </>
  )
}

function renderSearch(route = '/search') {
  return renderWithProviders(<Harness />, { route, path: '/search' })
}

const location = () => screen.getByTestId('location')
const box = () => screen.getByRole('searchbox', { name: 'ユーザー名か表示名' })

// 時計を進めて、400 ミリ秒の待ちを過ぎさせる。
async function pass(ms = 400) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('SearchPage', () => {
  beforeEach(() => {
    // 検索の待ち（400 ミリ秒）を進められるようにする。非同期の取得の待ちは実時間でも進める。
    vi.useFakeTimers({ shouldAdvanceTime: true })
    users.searchUsers.mockReset()
    follows.followUser.mockReset()
    follows.unfollowUser.mockReset()
    users.searchUsers.mockImplementation((q: string) => Promise.resolve({ items: [cardFor(q)], nextCursor: null }))
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u9', username: 'me' } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function setupUser() {
    return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  }

  it('q が無ければ「ユーザー名か表示名で探せます」を出し、API を呼ばない。見出しは「検索」でスマホ幅では見た目だけ隠す', async () => {
    renderSearch()

    const heading = screen.getByRole('heading', { level: 1, name: '検索' })
    expect(heading).toHaveClass('max-md:sr-only')
    expect(screen.getByText('ユーザー名か表示名で探せます')).toBeInTheDocument()
    expect(box()).toHaveValue('')
    expect(box()).not.toHaveFocus()
    await pass(1000)
    expect(users.searchUsers).not.toHaveBeenCalled()
  })

  it('入力して 400 ミリ秒後に searchUsers("ali", null) が呼ばれ、URL が ?q=ali になり、結果のカードが出る', async () => {
    renderSearch()
    const user = setupUser()

    await user.type(box(), 'ali')
    // 待ちの境目（399 / 400 ミリ秒）は SearchBox のテストで確かめる。ここは、打った直後には検索も URL の書き換えも無いこと。
    expect(users.searchUsers).not.toHaveBeenCalled()
    expect(location()).toHaveTextContent(/^\/search$/)
    await pass()

    const list = await screen.findByRole('list', { name: '検索結果' })
    expect(within(list).getByRole('link', { name: '結果-ali @user-ali' })).toBeInTheDocument()
    expect(users.searchUsers).toHaveBeenCalledWith('ali', null)
    expect(location()).toHaveTextContent(/^\/search\?q=ali$/)
    // 欄の文字は URL から書き戻さない（入力中の文字を壊さない）。
    expect(box()).toHaveValue('ali')
  })

  it('/search?q=ali で開くと、欄に ali が入り、すぐ検索される', async () => {
    renderSearch('/search?q=ali')

    expect(box()).toHaveValue('ali')
    expect(await screen.findByRole('link', { name: '結果-ali @user-ali' })).toBeInTheDocument()
    expect(users.searchUsers).toHaveBeenCalledWith('ali', null)
    expect(screen.queryByText('ユーザー名か表示名で探せます')).not.toBeInTheDocument()
  })

  it('前後の空白を除いた語で検索し、URL にもその語を書く。欄の文字は打ったまま', async () => {
    renderSearch()
    const user = setupUser()

    await user.type(box(), ' ali ')
    await pass()

    expect(await screen.findByRole('link', { name: '結果-ali @user-ali' })).toBeInTheDocument()
    expect(users.searchUsers).toHaveBeenCalledWith('ali', null)
    expect(users.searchUsers).toHaveBeenCalledTimes(1)
    expect(location()).toHaveTextContent(/^\/search\?q=ali$/)
    // 末尾の空白が書き戻しで消えると、続けて打った文字が前の語に付いてしまう。
    expect(box()).toHaveValue(' ali ')
  })

  it('入力を空にすると初期状態に戻り、URL から q が消える', async () => {
    renderSearch('/search?q=ali')
    const user = setupUser()
    await screen.findByRole('link', { name: '結果-ali @user-ali' })

    await user.clear(box())
    await pass()

    expect(await screen.findByText('ユーザー名か表示名で探せます')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '検索結果' })).not.toBeInTheDocument()
    expect(location()).toHaveTextContent(/^\/search$/)
    expect(users.searchUsers).toHaveBeenCalledTimes(1)
  })

  it('51 文字では「50 文字以内で入力してください」が出て API を呼ばず、URL には q が付く', async () => {
    renderSearch()
    const user = setupUser()
    const tooLong = 'a'.repeat(51)

    await user.type(box(), tooLong)
    await pass()

    expect(screen.getByRole('alert')).toHaveTextContent('50 文字以内で入力してください')
    expect(box()).toHaveAttribute('aria-invalid', 'true')
    expect(location()).toHaveTextContent(`/search?q=${tooLong}`)
    expect(screen.queryByText('ユーザー名か表示名で探せます')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '検索結果' })).not.toBeInTheDocument()
    await pass(1000)
    expect(users.searchUsers).not.toHaveBeenCalled()
  })

  it('/search?q=<51 文字> で開いても誤りが出て、API を呼ばない', async () => {
    renderSearch(`/search?q=${'a'.repeat(51)}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('50 文字以内で入力してください')
    await pass(1000)
    expect(users.searchUsers).not.toHaveBeenCalled()
  })

  it('/search?q=<絵文字 50 個> で開くと検索される（1 個を 1 文字と数える）', async () => {
    const emojis = '😀'.repeat(50)
    renderSearch(`/search?q=${encodeURIComponent(emojis)}`)

    await screen.findByRole('list', { name: '検索結果' })
    expect(users.searchUsers).toHaveBeenCalledWith(emojis, null)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('/search?q=%20%20 で開くと初期状態で、API を呼ばない', async () => {
    renderSearch('/search?q=%20%20')

    expect(screen.getByText('ユーザー名か表示名で探せます')).toBeInTheDocument()
    await pass(1000)
    expect(users.searchUsers).not.toHaveBeenCalled()
  })

  it('入力のたびに履歴を積まない: / → /search で入力して検索し、戻ると / に戻る', async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/', '/search']} initialIndex={1}>
            <Routes>
              <Route path="/" element={<p>ホームの画面</p>} />
              <Route path="/search" element={<SearchPage />} />
            </Routes>
            <Probe />
            <Back />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )
    const user = setupUser()

    await user.type(box(), 'ali')
    await pass()
    await screen.findByRole('link', { name: '結果-ali @user-ali' })
    await user.type(box(), 'ce')
    await pass()
    await screen.findByRole('link', { name: '結果-alice @user-alice' })
    expect(location()).toHaveTextContent(/^\/search\?q=alice$/)

    await user.click(screen.getByRole('button', { name: '履歴を戻る' }))

    expect(await screen.findByText('ホームの画面')).toBeInTheDocument()
    expect(location()).toHaveTextContent(/^\/$/)
  })

  it('検索語を変えると、前の結果は消えて読み込み中になる', async () => {
    const second = deferred<{ items: UserCard[]; nextCursor: string | null }>()
    users.searchUsers.mockImplementation((q: string) =>
      q === 'alib' ? second.promise : Promise.resolve({ items: [cardFor(q)], nextCursor: null }),
    )
    renderSearch('/search?q=ali')
    const user = setupUser()
    await screen.findByRole('link', { name: '結果-ali @user-ali' })

    await user.type(box(), 'b')
    await pass()

    expect(users.searchUsers).toHaveBeenCalledWith('alib', null)
    expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '結果-ali @user-ali' })).not.toBeInTheDocument()

    await act(async () => {
      second.resolve({ items: [cardFor('alib')], nextCursor: null })
    })
    expect(await screen.findByRole('link', { name: '結果-alib @user-alib' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: '読み込み中' })).not.toBeInTheDocument()
  })

  it('古い応答が後から返っても上書きしない: 「ab」の応答が先、「a」の応答が後でも、「ab」の結果だけが出ている', async () => {
    const forA = deferred<{ items: UserCard[]; nextCursor: string | null }>()
    const forAb = deferred<{ items: UserCard[]; nextCursor: string | null }>()
    users.searchUsers.mockImplementation((q: string) => (q === 'a' ? forA.promise : forAb.promise))
    renderSearch()
    const user = setupUser()

    await user.type(box(), 'a')
    await pass()
    expect(users.searchUsers).toHaveBeenCalledWith('a', null)
    await user.type(box(), 'b')
    await pass()
    expect(users.searchUsers).toHaveBeenCalledWith('ab', null)

    await act(async () => {
      forAb.resolve({ items: [cardFor('ab')], nextCursor: null })
    })
    expect(await screen.findByRole('link', { name: '結果-ab @user-ab' })).toBeInTheDocument()

    await act(async () => {
      forA.resolve({ items: [cardFor('a')], nextCursor: null })
    })
    await pass(100)

    expect(screen.getByRole('link', { name: '結果-ab @user-ab' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '結果-a @user-a' })).not.toBeInTheDocument()
  })

  it('自分のカードにはフォローボタンが出ない', async () => {
    users.searchUsers.mockResolvedValue({
      items: [makeCard(), makeCard({ id: 'u9', username: 'me', displayName: '私' })],
      nextCursor: null,
    })
    renderSearch('/search?q=m')

    const list = await screen.findByRole('list', { name: '検索結果' })
    expect(within(list).getByRole('button', { name: 'ボブさんをフォロー' })).toBeInTheDocument()
    expect(within(list).getByRole('link', { name: '私 @me' })).toBeInTheDocument()
    expect(within(list).queryByRole('button', { name: /私さんを/ })).not.toBeInTheDocument()
  })

  it('該当なしなら「該当するユーザーがいません」', async () => {
    users.searchUsers.mockResolvedValue({ items: [], nextCursor: null })
    renderSearch('/search?q=zzz')

    expect(await screen.findByText('該当するユーザーがいません')).toBeInTheDocument()
  })

  it('読み込みが 500 で失敗したら「再試行」が出て、押すと読み直す', async () => {
    users.searchUsers.mockRejectedValueOnce(apiError({ status: 500 }))
    renderSearch('/search?q=ali')
    const user = setupUser()

    await user.click(await screen.findByRole('button', { name: '再試行' }))

    expect(await screen.findByRole('link', { name: '結果-ali @user-ali' })).toBeInTheDocument()
    expect(users.searchUsers).toHaveBeenCalledTimes(2)
  })

  it('422 なら API の文言が欄の下に出て、「再試行」も一覧も出ない', async () => {
    users.searchUsers.mockRejectedValue(
      apiError({
        status: 422,
        code: 'VALIDATION_ERROR',
        detail: '入力内容に誤りがあります',
        errors: [{ field: 'q', message: '使えない文字が含まれています' }],
      }),
    )
    renderSearch('/search?q=a%00b')

    expect(await screen.findByRole('alert')).toHaveTextContent('使えない文字が含まれています')
    expect(box()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '検索結果' })).not.toBeInTheDocument()
    expect(screen.queryByText('読み込みに失敗しました')).not.toBeInTheDocument()
  })

  it('422 で errors が空なら detail を欄の下に出す', async () => {
    users.searchUsers.mockRejectedValue(apiError({ status: 422, code: 'VALIDATION_ERROR', detail: '入力内容に誤りがあります' }))
    renderSearch('/search?q=ali')

    expect(await screen.findByRole('alert')).toHaveTextContent('入力内容に誤りがあります')
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument()
  })

  it('検索画面にいるまま /search へのリンクを押すと、欄が空になり初期状態に戻る。待っていた 400 ミリ秒が過ぎても URL に古い語が書き戻されない', async () => {
    renderSearch('/search?q=ali')
    const user = setupUser()
    await screen.findByRole('link', { name: '結果-ali @user-ali' })

    await user.type(box(), 'x')
    await pass(100)
    await user.click(screen.getByRole('link', { name: '検索へ' }))

    expect(box()).toHaveValue('')
    expect(screen.getByText('ユーザー名か表示名で探せます')).toBeInTheDocument()
    expect(location()).toHaveTextContent(/^\/search$/)
    await pass(1000)

    expect(location()).toHaveTextContent(/^\/search$/)
    expect(box()).toHaveValue('')
    expect(users.searchUsers).not.toHaveBeenCalledWith('alix', null)
    expect(users.searchUsers).toHaveBeenCalledTimes(1)
  })

  it('戻る・進むで q が変わると、欄と結果がその q に従う', async () => {
    renderSearch('/search?q=ali')
    const user = setupUser()
    await screen.findByRole('link', { name: '結果-ali @user-ali' })

    await user.click(screen.getByRole('link', { name: 'ボブで検索' }))
    expect(box()).toHaveValue('bob')
    expect(await screen.findByRole('link', { name: '結果-bob @user-bob' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '履歴を戻る' }))

    expect(box()).toHaveValue('ali')
    expect(location()).toHaveTextContent(/^\/search\?q=ali$/)
    expect(await screen.findByRole('link', { name: '結果-ali @user-ali' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '結果-bob @user-bob' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '履歴を進む' }))

    expect(box()).toHaveValue('bob')
    expect(location()).toHaveTextContent(/^\/search\?q=bob$/)
    expect(await screen.findByRole('link', { name: '結果-bob @user-bob' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '結果-ali @user-ali' })).not.toBeInTheDocument()
  })
})
