// ユーザー名は大文字小文字を区別せず同じ人を指すので、キーは小文字にそろえる
// （/users/Alice と /users/alice を同じキャッシュにする）。
export function userKey(username: string) {
  return ['user', username.toLowerCase()] as const
}

export const meKey = ['me'] as const
