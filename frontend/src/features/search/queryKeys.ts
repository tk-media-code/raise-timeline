// ユーザー検索の結果のキー。root は全部の語の分を指す。
// 根を 'user' にしない: プロフィールのキー userKey(name) は ['user', name] なので、'search' というユーザー名の
// プロフィール ['user', 'search'] と、検索の根が重なってしまう。
// q は前後の空白を除いた語で、小文字にはそろえない: JS の小文字化と PostgreSQL の ILIKE が同じ結果になる保証が無いので、
// 大小だけ違う語は別のキャッシュにする（損は 1 回余分に読むだけ）。
export const searchKeys = {
  root: ['userSearch'] as const,
  of: (q: string) => ['userSearch', q] as const,
}
