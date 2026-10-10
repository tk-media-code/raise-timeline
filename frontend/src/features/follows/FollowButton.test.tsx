import { useQuery, type QueryClient } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserDetail } from '../../api/users'
import { createQueryClient } from '../../lib/queryClient'
import { TestProviders } from '../../test/providers'
import { userKey } from '../profile/queryKeys'
import { FollowButton } from './FollowButton'

const api = vi.hoisted(() => ({ followUser: vi.fn(), unfollowUser: vi.fn() }))
vi.mock('../../api/follows', () => api)

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../auth/AuthProvider', () => ({ useAuth }))

function makeDetail(overrides: Partial<UserDetail> = {}): UserDetail {
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
    ...overrides,
  }
}

// 本物の画面と同じく、ボタンの表示はキャッシュ（のデータ）から来る。押したあとの再描画を確かめるために使う。
function Harness() {
  const { data } = useQuery({ queryKey: userKey('alice'), queryFn: () => makeDetail(), staleTime: Infinity })
  return data ? <FollowButton user={data} /> : null
}

describe('FollowButton', () => {
  let client: QueryClient

  function renderButton(detail: UserDetail = makeDetail()) {
    client = createQueryClient()
    client.setQueryData(userKey('alice'), detail)
    return render(
      <TestProviders queryClient={client}>
        <Harness />
      </TestProviders>,
    )
  }

  beforeEach(() => {
    api.followUser.mockReset()
    api.unfollowUser.mockReset()
    api.followUser.mockResolvedValue(undefined)
    api.unfollowUser.mockResolvedValue(undefined)
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'u9', username: 'bob' } })
  })

  it('未フォローは「フォロー」で、名前は「アリスさんをフォロー」', () => {
    renderButton()

    const button = screen.getByRole('button', { name: 'アリスさんをフォロー' })
    expect(button).toHaveTextContent('フォロー')
    expect(button).not.toHaveTextContent('フォロー中')
    expect(button).toHaveAttribute('type', 'button')
  })

  it('フォロー中は「フォロー中」で、名前は「アリスさんをフォロー中（押すと解除）」。「解除」の文字は aria-hidden で置かれる', () => {
    renderButton(makeDetail({ isFollowing: true }))

    const button = screen.getByRole('button', { name: 'アリスさんをフォロー中（押すと解除）' })
    expect(button).toHaveTextContent('フォロー中')
    expect(screen.getByText('解除')).toHaveAttribute('aria-hidden', 'true')
  })

  it('押すとすぐ「フォロー中」になり、ポインタが離れる（mouseLeave）まで「解除」の文字を置かない', async () => {
    const user = userEvent.setup()
    renderButton()

    await user.click(screen.getByRole('button', { name: 'アリスさんをフォロー' }))

    const button = await screen.findByRole('button', { name: 'アリスさんをフォロー中（押すと解除）' })
    expect(screen.queryByText('解除')).not.toBeInTheDocument()
    await waitFor(() => expect(api.followUser).toHaveBeenCalledWith('alice'))

    fireEvent.mouseLeave(button)

    expect(screen.getByText('解除')).toHaveAttribute('aria-hidden', 'true')
  })

  it('押したあと、フォーカスが外れる（blur）まで「解除」の文字を置かない', async () => {
    const user = userEvent.setup()
    renderButton()

    await user.click(screen.getByRole('button', { name: 'アリスさんをフォロー' }))
    const button = await screen.findByRole('button', { name: 'アリスさんをフォロー中（押すと解除）' })
    expect(screen.queryByText('解除')).not.toBeInTheDocument()

    act(() => {
      button.blur()
    })

    expect(screen.getByText('解除')).toBeInTheDocument()
  })

  it('フォロー中を押すとすぐ「フォロー」に戻り、unfollowUser が呼ばれる', async () => {
    const user = userEvent.setup()
    renderButton(makeDetail({ isFollowing: true }))

    await user.click(screen.getByRole('button', { name: 'アリスさんをフォロー中（押すと解除）' }))

    expect(await screen.findByRole('button', { name: 'アリスさんをフォロー' })).toBeInTheDocument()
    await waitFor(() => expect(api.unfollowUser).toHaveBeenCalledWith('alice'))
  })

  // jsdom は幅を測れないので、幅が変わらない仕組みそのものを固定する。
  // 「フォロー中」は場所を残す（invisible。hidden だと幅が「解除」の分に縮む）。「解除」はその上に重ねる。
  it('フォロー中でホバーしても幅が変わらないよう、「フォロー中」は invisible にして場所を残し、「解除」は重ねて置く', () => {
    renderButton(makeDetail({ isFollowing: true }))

    const label = screen.getByText('フォロー中')
    expect(label).toHaveClass('group-hover:invisible')
    expect(label).not.toHaveClass('group-hover:hidden')
    const hover = screen.getByText('解除')
    expect(hover).toHaveClass('absolute', 'inset-0')
    expect(screen.getByRole('button')).toHaveClass('relative', 'min-w-26')
  })

  it('自分（useAuth の利用者と同じ id）には何も出さない', () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { id: 'a', username: 'alice' } })
    renderButton()

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
