import { countCodePoints } from '../../lib/text'

// 検索語の上限（コードポイント）。バックエンドの SearchQueries と同じ。
export const SEARCH_QUERY_MAX = 50
export const SEARCH_TOO_LONG = '50 文字以内で入力してください'

// 欄に打たれた文字列から、検索に使う語（前後の空白を除いたもの。全角の空白も空白）と、画面で出す誤りを決める。
// 空は誤りではない（error は null）。空かどうかは呼ぶ側が q === '' で見る。
export function checkSearchQuery(raw: string): { q: string; error: string | null } {
  const q = raw.trim()
  return { q, error: countCodePoints(q) > SEARCH_QUERY_MAX ? SEARCH_TOO_LONG : null }
}
