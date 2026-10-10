import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { Page, Post } from '../../api/posts'
import { postKey, timelineKeys, userPostsKeys } from './queryKeys'

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
export function hasData(query: { state: { data: unknown } }): boolean {
  return query.state.data !== undefined
}

// データが無く、最初の読み込み中のクエリ。書き込む先が無く、到着するページは変更の前の状態のものなので、
// そのまま待つと変更が入っていないことになる（「投稿しました」と出るのに新しい投稿が無い）。読み直して、いまの状態を取る。
// invalidateQueries だけでは足りない。データの無い取得中のクエリは、取得を捨てずに進行中の取得をそのまま待つ。
// 先に中断（待機中に戻る）してから invalidateQueries を呼ぶと、一覧の監視がある間は取り直される。
export async function reloadFirstLoads(client: QueryClient, filters: { queryKey: readonly unknown[]; exact?: boolean }): Promise<void> {
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

// 投稿が載る一覧の根のキー。タイムラインとその人の投稿一覧は、同じ規則（中断・直接書き換え・読み直し）で扱う。
// 規則を一覧の種類ごとに書き写すと、片方だけ直し忘れる。
const LIST_ROOTS = [timelineKeys.root, userPostsKeys.root] as const

// 「すべて」と、作者の投稿一覧の、1 ページ目の先頭に足す。まだ読み込んでいなければ、何もしない（開いたときに最新が取れる）。
// 最初の読み込みの最中なら、取り直す（reloadFirstLoads）。
// 同じ id の投稿が既にあれば先に除く（重複して並ばないように）。
export async function prependPost(client: QueryClient, post: Post): Promise<void> {
  const keys = [timelineKeys.all, userPostsKeys.of(post.author.username)]
  await Promise.all(keys.map((queryKey) => client.cancelQueries({ queryKey, exact: true, predicate: hasData })))
  for (const queryKey of keys) {
    client.setQueryData<TimelineData>(queryKey, (data) => {
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
  await Promise.all(keys.map((queryKey) => reloadFirstLoads(client, { queryKey, exact: true })))
}

// 一覧（種類を問わず全ページ。その人の投稿一覧も含む）と詳細のキャッシュの、同じ投稿を新しい内容に置き換える。
export async function replacePost(client: QueryClient, post: Post): Promise<void> {
  await Promise.all([
    ...LIST_ROOTS.map((queryKey) => client.cancelQueries({ queryKey, predicate: hasData })),
    client.cancelQueries({ queryKey: postKey(post.id), exact: true, predicate: hasData }),
  ])
  for (const queryKey of LIST_ROOTS) {
    client.setQueriesData<TimelineData>({ queryKey }, (data) =>
      mapItems(data, (items) => items.map((item) => (item.id === post.id ? post : item))),
    )
  }
  client.setQueryData<Post>(postKey(post.id), (current) => (current ? post : current))
  await Promise.all([
    ...LIST_ROOTS.map((queryKey) => reloadFirstLoads(client, { queryKey })),
    reloadFirstLoads(client, { queryKey: postKey(post.id), exact: true }),
  ])
}

// 一覧（種類を問わず全ページ）と詳細のキャッシュの、同じ投稿の「自分がいいねしたか」と数を書き換える。
// 同じ状態を何度書いても結果が変わらない（既に liked なら何もしない。数は 0 未満にしない）ので、
// 押したとき・失敗で戻すとき・要求が全部終わったときの 3 回、どの順で呼ばれても壊れない。
export async function setLikedInCache(client: QueryClient, postId: string, liked: boolean): Promise<void> {
  function apply(post: Post): Post {
    if (post.id !== postId || post.likedByMe === liked) return post
    return { ...post, likedByMe: liked, likeCount: Math.max(0, post.likeCount + (liked ? 1 : -1)) }
  }
  await Promise.all([
    ...LIST_ROOTS.map((queryKey) => client.cancelQueries({ queryKey, predicate: hasData })),
    client.cancelQueries({ queryKey: postKey(postId), exact: true, predicate: hasData }),
  ])
  for (const queryKey of LIST_ROOTS) {
    client.setQueriesData<TimelineData>({ queryKey }, (data) => mapItems(data, (items) => items.map(apply)))
  }
  client.setQueryData<Post>(postKey(postId), (current) => (current ? apply(current) : current))
  await Promise.all([
    ...LIST_ROOTS.map((queryKey) => reloadFirstLoads(client, { queryKey })),
    reloadFirstLoads(client, { queryKey: postKey(postId), exact: true }),
  ])
}

// 一覧（種類を問わず全ページ）と詳細のキャッシュの、同じ投稿の commentCount を delta（1 か -1）だけ変える。
// setLikedInCache と違い、同じ状態を何度書いても同じ、とはならない。呼ぶのはコメントの作成・削除が成功したときの 1 回だけ。
// 数は 0 未満にしない。
export async function changeCommentCountInCache(client: QueryClient, postId: string, delta: 1 | -1): Promise<void> {
  function apply(post: Post): Post {
    return post.id === postId ? { ...post, commentCount: Math.max(0, post.commentCount + delta) } : post
  }
  await Promise.all([
    ...LIST_ROOTS.map((queryKey) => client.cancelQueries({ queryKey, predicate: hasData })),
    client.cancelQueries({ queryKey: postKey(postId), exact: true, predicate: hasData }),
  ])
  for (const queryKey of LIST_ROOTS) {
    client.setQueriesData<TimelineData>({ queryKey }, (data) => mapItems(data, (items) => items.map(apply)))
  }
  client.setQueryData<Post>(postKey(postId), (current) => (current ? apply(current) : current))
  await Promise.all([
    ...LIST_ROOTS.map((queryKey) => reloadFirstLoads(client, { queryKey })),
    reloadFirstLoads(client, { queryKey: postKey(postId), exact: true }),
  ])
}

// すべての一覧から投稿を除き、詳細のキャッシュを捨てる。
export async function removePost(client: QueryClient, postId: string): Promise<void> {
  await Promise.all([
    ...LIST_ROOTS.map((queryKey) => client.cancelQueries({ queryKey, predicate: hasData })),
    client.cancelQueries({ queryKey: postKey(postId), exact: true, predicate: hasData }),
  ])
  for (const queryKey of LIST_ROOTS) {
    client.setQueriesData<TimelineData>({ queryKey }, (data) =>
      mapItems(data, (items) => items.filter((item) => item.id !== postId)),
    )
  }
  client.removeQueries({ queryKey: postKey(postId), exact: true })
}
