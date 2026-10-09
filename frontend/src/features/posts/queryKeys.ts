// タイムラインの一覧のキー。root は種類にかかわらず全部、all は「すべて」だけを指す。
export const timelineKeys = {
  root: ['timeline'] as const,
  all: ['timeline', 'all'] as const,
}

// 投稿詳細のキー。root は全部の詳細を指す（名前を変えても、印を付ける側が取りこぼさないよう定数にしてある）。
export const postKeys = {
  root: ['post'] as const,
}

export function postKey(id: string) {
  return [...postKeys.root, id] as const
}

// その人の投稿一覧のキー。ユーザー名は大文字小文字を区別せず同じ人を指すので、小文字にそろえる
// （/users/Alice と /users/alice を同じ一覧にする）。root は全員分を指す。
export const userPostsKeys = {
  root: ['userPosts'] as const,
  of: (username: string) => ['userPosts', username.toLowerCase()] as const,
}
