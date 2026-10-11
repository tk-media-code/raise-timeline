import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ApiError } from '../../api/client'
import type { Page } from '../../api/posts'
import type { UserCard, UserDetail } from '../../api/users'
import { createQueryClient } from '../../lib/queryClient'
import { TestProviders } from '../../test/providers'
import { likersKeys } from '../likes/queryKeys'
import { userKey } from '../profile/queryKeys'
import { followKeys } from './queryKeys'
import { useToggleFollow } from './useToggleFollow'

const api = vi.hoisted(() => ({ followUser: vi.fn(), unfollowUser: vi.fn() }))
vi.mock('../../api/follows', () => api)

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../auth/AuthProvider', () => ({ useAuth }))

type Data = InfiniteData<Page<UserCard>, string | null>
type Call = { resolve: () => void; reject: (error: unknown) => void }

const target = { id: 'a', username: 'alice', displayName: 'アリス', isFollowing: false }

function makeDetail(): UserDetail {
  return {
    id: 'a',
    username: 'alice',
    displayName: 'アリス',
    avatarUrl: null,
    bio: '',
    isFollowing: false,
    followersCount: 5,
    followingCount: 3,
    createdAt: '2026-10-01T00:00:00Z',
    isMe: false,
  }
}

function makeCard(id: string): UserCard {
  return { id, username: `user-${id}`, displayName: `名前 ${id}`, avatarUrl: null, bio: '', isFollowing: false }
}

function apiError(init: Partial<ConstructorParameters<typeof ApiError>[0]>): ApiError {
  return new ApiError({ status: 500, code: null, detail: '問題が起きました', errors: [], requestId: null, ...init })
}

// 呼ばれるたびに、手で解決する Promise を 1 つ作って並べる。
function holdCalls(fn: Mock): Call[] {
  const calls: Call[] = []
  fn.mockImplementation(
    () =>
      new Promise<void>((resolve, reject) => {
        calls.push({ resolve: () => resolve(), reject })
      }),
  )
  return calls
}

describe('useToggleFollow', () => {
  let client: QueryClient

  function setup() {
    client = createQueryClient()
    client.setQueryData(userKey('alice'), makeDetail())
    client.setQueryData<Data>(likersKeys.of('p1'), { pages: [{ items: [makeCard('a'), makeCard('b')], nextCursor: null }], pageParams: [null] })
    function wrapper({ children }: { children: ReactNode }) {
      return <TestProviders queryClient={client}>{children}</TestProviders>
    }
    return renderHook(() => useToggleFollow(target), { wrapper })
  }

  function profile(): UserDetail | undefined {
    return client.getQueryData<UserDetail>(userKey('alice'))
  }

  function card(): UserCard | undefined {
    return client.getQueryData<Data>(likersKeys.of('p1'))?.pages[0]?.items[0]
  }

  function press(toggle: () => void) {
    act(() => {
      toggle()
    })
  }

  async function pressAndWaitSent(toggle: () => void, sent: Mock) {
    const before = sent.mock.calls.length
    press(toggle)
    await waitFor(() => expect(sent).toHaveBeenCalledTimes(before + 1))
  }

  async function expectShown(following: boolean, followers: number) {
    await waitFor(() => {
      expect(profile()).toMatchObject({ isFollowing: following, followersCount: followers })
      expect(card()).toMatchObject({ isFollowing: following })
    })
  }

  async function settle(calls: Call[], index: number, how: 'resolve' | { reject: unknown } = 'resolve') {
    await waitFor(() => expect(calls[index]).toBeDefined())
    await act(async () => {
      if (how === 'resolve') calls[index]?.resolve()
      else calls[index]?.reject(how.reject)
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }

  beforeEach(() => {
    api.followUser.mockReset()
    api.unfollowUser.mockReset()
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u9', username: 'bob' } })
  })

  it('押すと、完了を待たずにプロフィールの isFollowing true・followersCount 6 になり、followUser が 1 回呼ばれる', async () => {
    const calls = holdCalls(api.followUser)
    const { result } = setup()

    press(result.current)

    await expectShown(true, 6)
    await waitFor(() => expect(api.followUser).toHaveBeenCalledTimes(1))
    expect(api.followUser).toHaveBeenCalledWith('alice')
    await settle(calls, 0)
  })

  it('送信中に 2 回押す（解除 → フォロー）と、最初の要求の完了後は何も送らず、followersCount は +1 のまま', async () => {
    const calls = holdCalls(api.followUser)
    holdCalls(api.unfollowUser)
    const { result } = setup()

    await pressAndWaitSent(result.current, api.followUser)
    press(result.current)
    press(result.current)
    await expectShown(true, 6)
    await settle(calls, 0)

    expect(api.followUser).toHaveBeenCalledTimes(1)
    expect(api.unfollowUser).not.toHaveBeenCalled()
    await expectShown(true, 6)
  })

  it('フォローが 500 で失敗すると元に戻り、通知が 1 つ出る', async () => {
    const calls = holdCalls(api.followUser)
    const { result } = setup()

    press(result.current)
    await settle(calls, 0, { reject: apiError({ status: 500, requestId: 'r1' }) })

    await expectShown(false, 5)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('フォローに失敗しました。もう一度お試しください（ID: r1）')
  })

  it('解除の失敗は「フォローの解除に失敗しました。もう一度お試しください」', async () => {
    const follows = holdCalls(api.followUser)
    const unfollows = holdCalls(api.unfollowUser)
    const { result } = setup()

    await pressAndWaitSent(result.current, api.followUser)
    press(result.current)
    await settle(follows, 0)
    await waitFor(() => expect(api.unfollowUser).toHaveBeenCalledTimes(1))
    await settle(unfollows, 0, { reject: new TypeError('Failed to fetch') })

    await expectShown(true, 6)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('フォローの解除に失敗しました。もう一度お試しください')
  })

  it('404 では「見つかりません」が出て、一覧からその人のカードが除かれ、プロフィールが invalidated になる', async () => {
    const calls = holdCalls(api.followUser)
    const { result } = setup()

    press(result.current)
    await settle(calls, 0, { reject: apiError({ status: 404, code: 'NOT_FOUND', detail: '見つかりません' }) })

    await waitFor(() => expect(card()?.id).toBe('b'))
    expect(screen.getByRole('alert')).toHaveTextContent('見つかりません')
    await waitFor(() => expect(client.getQueryState(userKey('alice'))?.isInvalidated).toBe(true))
    // 要求が全部終わった後の書き直し（変更なし）で、無効の印が外れない
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(client.getQueryState(userKey('alice'))?.isInvalidated).toBe(true)
  })

  it('要求が全部終わると、開いていない自分のフォロー中一覧のキャッシュが消える。相手のフォロワー一覧も', async () => {
    const calls = holdCalls(api.followUser)
    const { result } = setup()
    client.setQueryData(followKeys.following('bob'), { pages: [], pageParams: [] })
    client.setQueryData(followKeys.followers('alice'), { pages: [], pageParams: [] })
    client.setQueryData(followKeys.following('carol'), { pages: [], pageParams: [] })

    press(result.current)
    await waitFor(() => expect(api.followUser).toHaveBeenCalledTimes(1))
    expect(client.getQueryData(followKeys.following('bob'))).toBeDefined()
    await settle(calls, 0)

    await waitFor(() => expect(client.getQueryData(followKeys.following('bob'))).toBeUndefined())
    expect(client.getQueryData(followKeys.followers('alice'))).toBeUndefined()
    expect(client.getQueryData(followKeys.following('carol'))).toBeDefined()
  })
})
