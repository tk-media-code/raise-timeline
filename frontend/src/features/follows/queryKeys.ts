// フォロワー／フォロー中の一覧のキー。root は全員分を指す。
// ユーザー名は大文字小文字を区別せず同じ人を指すので、小文字にそろえる（/users/Alice と /users/alice を同じ一覧にする）。
export const followKeys = {
  root: ['follows'] as const,
  followers: (username: string) => ['follows', 'followers', username.toLowerCase()] as const,
  following: (username: string) => ['follows', 'following', username.toLowerCase()] as const,
}
