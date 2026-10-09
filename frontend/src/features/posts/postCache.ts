import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { Page, Post } from '../../api/posts'
import { postKey, timelineKeys } from './queryKeys'

type TimelineData = InfiniteData<Page<Post>, string | null>

// 投稿の作成・編集・削除の結果を、取り直さずにキャッシュへ直接書く。
// invalidateQueries で取り直すと、無限スクロールで読み込んだ全ページを順に取り直してしまう。

function mapItems(data: TimelineData | undefined, fn: (items: Post[]) => Post[]): TimelineData | undefined {
  if (!data) return data
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })) }
}

// 「すべて」の 1 ページ目の先頭に足す。まだ読み込んでいなければ、何もしない（開いたときに最新が取れる）。
export function prependPost(client: QueryClient, post: Post): void {
  client.setQueryData<TimelineData>(timelineKeys.all, (data) => {
    const first = data?.pages[0]
    if (!data || !first) return data
    return { ...data, pages: [{ ...first, items: [post, ...first.items] }, ...data.pages.slice(1)] }
  })
}

// 一覧（種類を問わず全ページ）と詳細のキャッシュの、同じ投稿を新しい内容に置き換える。
export function replacePost(client: QueryClient, post: Post): void {
  client.setQueriesData<TimelineData>({ queryKey: timelineKeys.root }, (data) =>
    mapItems(data, (items) => items.map((item) => (item.id === post.id ? post : item))),
  )
  client.setQueryData<Post>(postKey(post.id), (current) => (current ? post : current))
}

// すべての一覧から投稿を除き、詳細のキャッシュを捨てる。
export function removePost(client: QueryClient, postId: string): void {
  client.setQueriesData<TimelineData>({ queryKey: timelineKeys.root }, (data) =>
    mapItems(data, (items) => items.filter((item) => item.id !== postId)),
  )
  client.removeQueries({ queryKey: postKey(postId), exact: true })
}
