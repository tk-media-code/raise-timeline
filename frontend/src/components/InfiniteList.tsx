import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query'
import { useEffect, useRef, type ReactNode } from 'react'
import type { Page } from '../api/posts'
import { Spinner } from './Spinner'

type InfiniteListProps<T> = {
  query: UseInfiniteQueryResult<InfiniteData<Page<T>, string | null>, Error>
  getKey: (item: T) => string
  renderItem: (item: T) => ReactNode
  emptyMessage: string
  label: string
}

function RetryMessage({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <p>読み込みに失敗しました</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 min-w-11 rounded-md border border-gray-400 bg-white px-4 text-black focus:outline-2 focus:outline-offset-2 focus:outline-sky-600"
      >
        再試行
      </button>
    </div>
  )
}

// 一覧の下の見えない目印（sentinel）が画面に入ったら、次のページを読む。
export function InfiniteList<T>({ query, getKey, renderItem, emptyMessage, label }: InfiniteListProps<T>) {
  const { data, hasNextPage, isFetching, isFetchingNextPage, isError, isPending, fetchNextPage, refetch } = query
  const sentinelRef = useRef<HTMLDivElement>(null)

  // 続きがあり、読み込み中でも失敗でもない間だけ監視する。
  // 失敗のあとに監視を続けると、目印が見えている限り失敗が繰り返され、利用者が「再試行」を押す前に読み直しが走り続ける。
  const observing = hasNextPage && !isFetching && !isError

  // 状態が変わるたびに監視を付け直す（observing と data が変わると、いったん外して付け直す）。
  // IntersectionObserver は「見えているかどうかが変わったとき」と「observe した直後」にしか知らせない。
  // 付け直さないと、1 ページ目が短くて目印が画面に入ったままのとき、次のページが届いても知らせが来ず、
  // スクロールしない限り止まってしまう。付け直せば、その時点で見えていれば直ちに知らせが来て、終端まで続けて読まれる。
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!observing || !sentinel) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage()
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [observing, data, fetchNextPage])

  if (isPending) return <Spinner />
  if (!data) return <RetryMessage onRetry={() => void refetch()} />

  const items = data.pages.flatMap((page) => page.items)
  if (items.length === 0) {
    return isError ? (
      <RetryMessage onRetry={() => void refetch()} />
    ) : (
      <p className="p-8 text-center text-gray-600">{emptyMessage}</p>
    )
  }

  return (
    <>
      <ul aria-label={label}>
        {items.map((item) => (
          <li key={getKey(item)}>{renderItem(item)}</li>
        ))}
      </ul>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      {isFetchingNextPage ? (
        <output aria-label="読み込み中" className="flex justify-center p-4">
          <div
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700"
          />
        </output>
      ) : isError ? (
        <RetryMessage onRetry={() => void fetchNextPage()} />
      ) : !hasNextPage ? (
        <p className="p-6 text-center text-sm text-gray-600">これ以上ありません</p>
      ) : null}
    </>
  )
}
