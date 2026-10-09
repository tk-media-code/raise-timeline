import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page } from '../api/posts'
import { installFakeIntersectionObserver, type FakeIntersectionObserverControl } from '../test/intersectionObserver'
import { renderWithProviders } from '../test/providers'
import { InfiniteList } from './InfiniteList'

type Item = { id: string; name: string }
type QueryFn = (cursor: string | null) => Promise<Page<Item>>

function List({ queryFn }: { queryFn: QueryFn }) {
  const query = useInfiniteQuery<Page<Item>, Error, InfiniteData<Page<Item>, string | null>, string[], string | null>({
    queryKey: ['test-list'],
    queryFn: ({ pageParam }) => queryFn(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })
  return (
    <InfiniteList
      query={query}
      getKey={(item) => item.id}
      renderItem={(item) => <span>{item.name}</span>}
      emptyMessage="まだ何もありません"
      label="テスト一覧"
    />
  )
}

function page(names: string[], nextCursor: string | null): Page<Item> {
  return { items: names.map((name) => ({ id: name, name })), nextCursor }
}

describe('InfiniteList', () => {
  let observer: FakeIntersectionObserverControl

  beforeEach(() => {
    observer = installFakeIntersectionObserver()
  })
  afterEach(() => {
    observer.uninstall()
  })

  it('最初は読み込み中', () => {
    renderWithProviders(<List queryFn={() => new Promise(() => {})} />)

    expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument()
  })

  it('0 件なら空の文言', async () => {
    renderWithProviders(<List queryFn={() => Promise.resolve(page([], null))} />)

    expect(await screen.findByText('まだ何もありません')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText('これ以上ありません')).not.toBeInTheDocument()
  })

  it('末尾が見えると次のページを cursor 付きで読み、最後は「これ以上ありません」', async () => {
    const queryFn = vi.fn<QueryFn>((cursor) =>
      Promise.resolve(cursor === null ? page(['A', 'B'], 'c2') : page(['C'], null)),
    )
    renderWithProviders(<List queryFn={queryFn} />)

    const list = await screen.findByRole('list', { name: 'テスト一覧' })
    expect(list).toHaveTextContent('AB')
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(queryFn).toHaveBeenLastCalledWith(null)
    expect(screen.queryByText('これ以上ありません')).not.toBeInTheDocument()

    await waitFor(() => expect(observer.observedCount()).toBe(1))
    observer.intersect()

    expect(await screen.findByText('これ以上ありません')).toBeInTheDocument()
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(queryFn).toHaveBeenLastCalledWith('c2')
    expect(screen.getByRole('list', { name: 'テスト一覧' })).toHaveTextContent('ABC')
  })

  it('次を読んでいる間は小さな読み込み中が出る', async () => {
    let resolveSecond: (value: Page<Item>) => void = () => {}
    const queryFn: QueryFn = (cursor) =>
      cursor === null
        ? Promise.resolve(page(['A'], 'c2'))
        : new Promise((resolve) => {
            resolveSecond = resolve
          })
    renderWithProviders(<List queryFn={queryFn} />)

    await screen.findByRole('list', { name: 'テスト一覧' })
    await waitFor(() => expect(observer.observedCount()).toBe(1))
    observer.intersect()

    expect(await screen.findByRole('status', { name: '読み込み中' })).toBeInTheDocument()
    // 読み込み中は一覧を消さない。
    expect(screen.getByRole('list', { name: 'テスト一覧' })).toHaveTextContent('A')
    // 読み込み中は監視しない。
    expect(observer.observedCount()).toBe(0)

    await act(async () => {
      resolveSecond(page(['B'], null))
    })
    await waitFor(() => expect(screen.queryByRole('status', { name: '読み込み中' })).not.toBeInTheDocument())
  })

  it('最初の失敗で「再試行」を押すと読み直す', async () => {
    const user = userEvent.setup()
    const queryFn = vi
      .fn<QueryFn>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(page(['A'], null))
    renderWithProviders(<List queryFn={queryFn} />)

    expect(await screen.findByText('読み込みに失敗しました')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '再試行' }))

    expect(await screen.findByRole('list', { name: 'テスト一覧' })).toHaveTextContent('A')
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(queryFn).toHaveBeenLastCalledWith(null)
  })

  it('次のページの失敗で「再試行」を押すと次を読み直す', async () => {
    const user = userEvent.setup()
    // 'c2' の 1 回目だけ失敗し、2 回目は成功する。
    let secondPageCalls = 0
    const queryFn = vi.fn<QueryFn>((cursor) => {
      if (cursor === null) return Promise.resolve(page(['A'], 'c2'))
      secondPageCalls += 1
      return secondPageCalls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve(page(['B'], null))
    })
    renderWithProviders(<List queryFn={queryFn} />)

    await screen.findByRole('list', { name: 'テスト一覧' })
    await waitFor(() => expect(observer.observedCount()).toBe(1))
    observer.intersect()

    expect(await screen.findByText('読み込みに失敗しました')).toBeInTheDocument()
    // 読めた分は残す。
    expect(screen.getByRole('list', { name: 'テスト一覧' })).toHaveTextContent('A')

    await user.click(screen.getByRole('button', { name: '再試行' }))

    expect(await screen.findByText('これ以上ありません')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'テスト一覧' })).toHaveTextContent('AB')
    expect(queryFn).toHaveBeenCalledTimes(3)
    expect(queryFn).toHaveBeenLastCalledWith('c2')
  })

  it('失敗のあとは、末尾が見えても自動で読み直さない', async () => {
    const queryFn = vi.fn<QueryFn>((cursor) =>
      cursor === null ? Promise.resolve(page(['A'], 'c2')) : Promise.reject(new Error('boom')),
    )
    renderWithProviders(<List queryFn={queryFn} />)

    await screen.findByRole('list', { name: 'テスト一覧' })
    await waitFor(() => expect(observer.observedCount()).toBe(1))
    observer.intersect()
    expect(await screen.findByText('読み込みに失敗しました')).toBeInTheDocument()
    expect(queryFn).toHaveBeenCalledTimes(2)

    // 見えたままにしても、監視していないので何も起きない。
    observer.setVisible(true)
    observer.intersect()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(observer.observedCount()).toBe(0)
    expect(queryFn).toHaveBeenCalledTimes(2)
  })

  it('1 ページ目が短く監視要素が見えたままなら、続けて終端まで読む', async () => {
    observer.setVisible(true)
    const queryFn = vi.fn<QueryFn>((cursor) => {
      if (cursor === null) return Promise.resolve(page(['A', 'B'], 'c2'))
      if (cursor === 'c2') return Promise.resolve(page(['C', 'D'], 'c3'))
      return Promise.resolve(page(['E', 'F'], null))
    })
    renderWithProviders(<List queryFn={queryFn} />)

    // 操作は何もしない。
    expect(await screen.findByText('これ以上ありません')).toBeInTheDocument()
    expect(queryFn.mock.calls.map(([cursor]) => cursor)).toEqual([null, 'c2', 'c3'])
    expect(screen.getByRole('list', { name: 'テスト一覧' })).toHaveTextContent('ABCDEF')
  })

  it('続きが無ければ監視しない', async () => {
    renderWithProviders(<List queryFn={() => Promise.resolve(page(['A'], null))} />)

    expect(await screen.findByText('これ以上ありません')).toBeInTheDocument()

    expect(observer.observedCount()).toBe(0)
  })
})
