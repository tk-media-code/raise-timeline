import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { Comment } from '../../api/comments'
import type { Page } from '../../api/posts'
import { hasData, reloadFirstLoads } from '../posts/postCache'
import { postKey } from '../posts/queryKeys'
import { commentsKeys } from './queryKeys'

type CommentsData = InfiniteData<Page<Comment>, string | null>

// コメントを書いた・消した結果を、取り直さずにコメント一覧のキャッシュへ直接書く。
// 規則は投稿（postCache.ts）と同じ。データのある読み込みは中断してから書き（次のページの到着で、
// 足したコメントが消えたり、消したコメントが戻ったりしないように）、
// 最初の読み込みの最中なら読み直す。まだ読んでいない一覧には何もしない（開いたときに最新が取れる）。

// 1 ページ目の先頭に足す。同じ id のコメントが既にあれば先に除く（重複して並ばないように）。
export async function prependComment(client: QueryClient, postId: string, comment: Comment): Promise<void> {
  const queryKey = commentsKeys.of(postId)
  await client.cancelQueries({ queryKey, exact: true, predicate: hasData })
  client.setQueryData<CommentsData>(queryKey, (data) => {
    if (!data || data.pages.length === 0) return data
    return {
      ...data,
      pages: data.pages.map((page, index) => {
        const rest = page.items.filter((item) => item.id !== comment.id)
        return { ...page, items: index === 0 ? [comment, ...rest] : rest }
      }),
    }
  })
  await reloadFirstLoads(client, { queryKey, exact: true })
}

// 全ページからそのコメントを除く。
export async function removeComment(client: QueryClient, postId: string, commentId: string): Promise<void> {
  const queryKey = commentsKeys.of(postId)
  await client.cancelQueries({ queryKey, exact: true, predicate: hasData })
  client.setQueryData<CommentsData>(queryKey, (data) => {
    if (!data) return data
    return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== commentId) })) }
  })
  await reloadFirstLoads(client, { queryKey, exact: true })
}

// 404: コメントはもう無い。一覧に残っていると、押すたびに同じ失敗をするので除く。
// 数を含めた本当の状態は分からないので、commentCount は書き換えず、投稿詳細を読み直しの対象にする。
export async function forgetMissingComment(client: QueryClient, postId: string, commentId: string): Promise<void> {
  await removeComment(client, postId, commentId)
  void client.invalidateQueries({ queryKey: postKey(postId), exact: true })
}
