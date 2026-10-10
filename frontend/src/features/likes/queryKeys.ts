// 「いいねした人」の一覧のキー。root は全部の投稿分を指す。
export const likersKeys = {
  root: ['likers'] as const,
  of: (postId: string) => ['likers', postId] as const,
}
