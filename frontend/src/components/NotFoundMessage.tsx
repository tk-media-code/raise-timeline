import { Link } from 'react-router'

// ログイン後の枠（AppLayout の main）の中に出す「見つかりません」。h1 はこの部品が持つ（見出しは各画面が持つ）。
// main は持たない。枠の外に出す NotFoundPage とは別の部品。
export function NotFoundMessage() {
  return (
    <div className="flex flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-bold">見つかりません</h1>
      <p className="text-sm">お探しの投稿やユーザーは見つかりませんでした</p>
      <p>
        <Link to="/" className="inline-flex min-h-11 items-center text-sky-700 underline">
          ホームへ戻る
        </Link>
      </p>
    </div>
  )
}
