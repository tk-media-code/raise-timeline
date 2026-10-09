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

// データがあるクエリだけを中断する。データが無い（最初の読み込み中の）クエリを中断すると、
// 待機中（pending）に戻って誰も取り直さず、一覧が読み込み中のまま止まる。
// そのクエリには上書きされる土台も無いので、中断する意味もない。
function hasData(query: { state: { data: unknown } }): boolean {
  return query.state.data !== undefined
}

// データが無く、最初の読み込み中のクエリ。書き込む先が無く、到着するページは変更の前の状態のものなので、
// そのまま待つと変更が入っていないことになる（「投稿しました」と出るのに新しい投稿が無い）。読み直して、いまの状態を取る。
// invalidateQueries だけでは足りない。データの無い取得中のクエリは、取得を捨てずに進行中の取得をそのまま待つ。
// 先に中断（待機中に戻る）してから invalidateQueries を呼ぶと、一覧の監視がある間は取り直される。
async function reloadFirstLoads(client: QueryClient, filters: { queryKey: readonly unknown[]; exact?: boolean }): Promise<void> {
  const firstLoads = client
    .getQueryCache()
    .findAll({ ...filters, predicate: (query) => !hasData(query) && query.state.fetchStatus === 'fetching' })
  for (const query of firstLoads) {
    await query.cancel({ revert: true })
    void client.invalidateQueries({ queryKey: query.queryKey, exact: true })
  }
}

function mapItems(data: TimelineData | undefined, fn: (items: Post[]) => Post[]): TimelineData | undefined {
  if (!data) return data
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })) }
}

// 「すべて」の 1 ページ目の先頭に足す。まだ読み込んでいなければ、何もしない（開いたときに最新が取れる）。
// 最初の読み込みの最中なら、取り直す（reloadFirstLoads）。
// 同じ id の投稿が既にあれば先に除く（重複して並ばないように）。
export async function prependPost(client: QueryClient, post: Post): Promise<void> {
  await client.cancelQueries({ queryKey: timelineKeys.all, predicate: hasData })
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
  await reloadFirstLoads(client, { queryKey: timelineKeys.all })
}

// 一覧（種類を問わず全ページ）と詳細のキャッシュの、同じ投稿を新しい内容に置き換える。
export async function replacePost(client: QueryClient, post: Post): Promise<void> {
  await Promise.all([
    client.cancelQueries({ queryKey: timelineKeys.root, predicate: hasData }),
    client.cancelQueries({ queryKey: postKey(post.id), exact: true, predicate: hasData }),
  ])
  client.setQueriesData<TimelineData>({ queryKey: timelineKeys.root }, (data) =>
    mapItems(data, (items) => items.map((item) => (item.id === post.id ? post : item))),
  )
  client.setQueryData<Post>(postKey(post.id), (current) => (current ? post : current))
  await Promise.all([
    reloadFirstLoads(client, { queryKey: timelineKeys.root }),
    reloadFirstLoads(client, { queryKey: postKey(post.id), exact: true }),
  ])
}

// すべての一覧から投稿を除き、詳細のキャッシュを捨てる。
export async function removePost(client: QueryClient, postId: string): Promise<void> {
  await Promise.all([
    client.cancelQueries({ queryKey: timelineKeys.root, predicate: hasData }),
    client.cancelQueries({ queryKey: postKey(postId), exact: true, predicate: hasData }),
  ])
  client.setQueriesData<TimelineData>({ queryKey: timelineKeys.root }, (data) =>
    mapItems(data, (items) => items.filter((item) => item.id !== postId)),
  )
  client.removeQueries({ queryKey: postKey(postId), exact: true })
}
