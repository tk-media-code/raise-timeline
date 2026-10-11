import { useLocation, useSearchParams } from 'react-router'
import { formatErrorMessage } from '../api/client'
import { InfiniteList } from '../components/InfiniteList'
import { isApiError } from '../features/posts/mutations'
import { SearchBox } from '../features/search/SearchBox'
import { checkSearchQuery } from '../features/search/searchQuery'
import { useUserSearch } from '../features/search/useUserSearch'
import { UserCardItem } from '../features/users/UserCardItem'

// 自分が URL を書き換えたときに history の state へ入れる印の形。
function viewKeyOf(state: unknown): string | null {
  if (typeof state === 'object' && state !== null && 'viewKey' in state && typeof state.viewKey === 'string') {
    return state.viewKey
  }
  return null
}

// 何を表示するかは、URL の ?q= だけから決める（欄の中身は見ない）。リロード・URL の共有・「戻る」で同じ表示になる。
// URL を書き換えるのは検索したとき（SearchBox の onSearch）だけで、履歴は置き換える（入力のたびに「戻る」の履歴を積まない）。
//
// 欄に q を書き戻さない: 入力中の欄を URL から作り直すと、検索語の前後の空白が除かれて、打っていた末尾の空白（「ali 」）が消え、
// 続けて打った文字が前の語に付いてしまう（「alib」）。書き戻すのは、URL が外から変わったときだけ。
//
// 外から変わったかどうかの見分け方: 自分の書き換えには state: { viewKey } を付ける。
// viewKey = location.state?.viewKey ?? location.key を SearchBox の key にする。
// - 自分の書き換え: state の viewKey を引き継ぐので viewKey は変わらず、欄はそのまま（入力中の文字を壊さない）。
// - 外からの移動（左ナビ・下部タブの「検索」のリンク、戻る、進む）: state が無い（または別の履歴の項目の）ので
//   viewKey が変わり、欄は URL の語で作り直される。SearchBox が外されるので、待っていた 400 ミリ秒の検索も捨てられ、
//   古い語が URL に書き戻されない。「検索」のリンクを押せば、欄が空になり初期状態に戻る。
//
// AppLayout の <main> の中に描かれるので、ここでは <main> を持たない。
export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const viewKey = viewKeyOf(location.state) ?? location.key

  const raw = searchParams.get('q') ?? ''
  const { q, error: tooLong } = checkSearchQuery(raw)
  // 語が空、または上限を超えているときは API を呼ばない（超えた語はサーバーも 422 にする）。
  const search = useUserSearch(q, q !== '' && tooLong === null)

  // 422 は再試行しても直らない（URL を手で書き換えて使えない文字を入れた場合など）ので、API の文言を欄の下に出す。
  const rejected = search.isError && isApiError(search.error, 422) ? search.error : null
  const error = tooLong ?? (rejected ? (rejected.errors[0]?.message ?? formatErrorMessage(rejected)) : null)

  function handleSearch(typed: string) {
    const next = typed.trim()
    setSearchParams(next === '' ? {} : { q: next }, { replace: true, state: { viewKey } })
  }

  return (
    <div className="flex flex-col">
      {/* スマホ幅は上部バーに同じ画面名が出るので、見出しは読み上げ用に残して見た目では隠す。 */}
      <h1 className="p-4 text-2xl font-bold max-md:sr-only">検索</h1>
      <SearchBox key={viewKey} defaultValue={raw} error={error} onSearch={handleSearch} />
      {q === '' ? (
        <p className="p-8 text-center text-gray-600">ユーザー名か表示名で探せます</p>
      ) : error !== null ? null : (
        <InfiniteList
          query={search}
          getKey={(user) => user.id}
          renderItem={(user) => <UserCardItem user={user} />}
          emptyMessage="該当するユーザーがいません"
          label="検索結果"
        />
      )}
    </div>
  )
}
