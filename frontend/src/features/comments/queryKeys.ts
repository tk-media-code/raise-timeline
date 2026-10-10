// 投稿ごとのコメント一覧のキー。root は全部の投稿分を指す。
export const commentsKeys = {
  root: ['comments'] as const,
  of: (postId: string) => ['comments', postId] as const,
}
