import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { Page, Post } from '../../api/posts'
import { postKey, timelineKeys } from './queryKeys'

type TimelineData = InfiniteData<Page<Post>, string | null>

// 投稿の作成・編集・削除の結果を、取り直さずにキャッシュへ直接書く。
// invalidateQueries で取り直すと、無限スクロールで読み込んだ全ページを順に取り直してしまう。
//
// 書く前に、取得中の読み込みを中断する（cancelQueries）。無限読み込みは取得を始めた時点のキャッシュを土台に
// 結果を作るので、次のページの取得中に書いても、そのページの到着で古い土台に上書きされ、
// 削除した投稿が戻る・編集が元に戻る・新しい投稿が消える。中断された読み込みは元の状態に戻り、
// 一覧の監視がかかり直して、書いたあとの土台から読み直される。

function mapItems(data: TimelineData | undefined, fn: (items: Post[]) => Post[]): TimelineData | undefined {
  if (!data) return data
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })) }
}

// 「すべて」の 1 ページ目の先頭に足す。まだ読み込んでいなければ、何もしない（開いたときに最新が取れる）。
// 同じ id の投稿が既にあれば先に除く（重複して並ばないように）。
export async function prependPost(client: QueryClient, post: Post): Promise<void> {
  await client.cancelQueries({ queryKey: timelineKeys.all })
  client.setQueryData<TimelineData>(timelineKeys.all, (data) => {
    if (!data || data.pages.length === 0) return data
    return {
      ...data,
      pages: data.pages.map((page, index) => {
        const rest = page.items.filter((item) => item.id !== post.id)
        return { ...page, items: index === 0 ? [post, ...rest] : rest }
      }),
    }
  })
}

// 一覧（種類を問わず全ページ）と詳細のキャッシュの、同じ投稿を新しい内容に置き換える。
export async function replacePost(client: QueryClient, post: Post): Promise<void> {
  await Promise.all([
    client.cancelQueries({ queryKey: timelineKeys.root }),
    client.cancelQueries({ queryKey: postKey(post.id), exact: true }),
  ])
  client.setQueriesData<TimelineData>({ queryKey: timelineKeys.root }, (data) =>
    mapItems(data, (items) => items.map((item) => (item.id === post.id ? post : item))),
  )
  client.setQueryData<Post>(postKey(post.id), (current) => (current ? post : current))
}

// すべての一覧から投稿を除き、詳細のキャッシュを捨てる。
export async function removePost(client: QueryClient, postId: string): Promise<void> {
  await Promise.all([
    client.cancelQueries({ queryKey: timelineKeys.root }),
    client.cancelQueries({ queryKey: postKey(postId), exact: true }),
  ])
  client.setQueriesData<TimelineData>({ queryKey: timelineKeys.root }, (data) =>
    mapItems(data, (items) => items.filter((item) => item.id !== postId)),
  )
  client.removeQueries({ queryKey: postKey(postId), exact: true })
}
