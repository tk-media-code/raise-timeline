import { useParams } from 'react-router'
import { isNotFound } from '../api/client'
import { InfiniteList } from '../components/InfiniteList'
import { NotFoundMessage } from '../components/NotFoundMessage'
import { useLikers } from '../features/likes/useLikers'
import { UserCardItem } from '../features/users/UserCardItem'

// AppLayout の <main> の中に描かれるので、ここでは <main> を持たない。
export default function LikersPage() {
  const { id = '' } = useParams()
  const query = useLikers(id)

  // まだ一覧を読み込めていないまま 404・400 になったときだけ「見つかりません」にする。
  // 表示中の一覧の読み直しが失敗しても、見えている一覧は消さない。
  if (query.isError && !query.data && isNotFound(query.error)) return <NotFoundMessage />

  return (
    <div className="flex flex-col">
      {/* スマホ幅は上部バーに同じ画面名が出るので、見出しは読み上げ用に残して見た目では隠す。 */}
      <h1 className="p-4 text-2xl font-bold max-md:sr-only">いいねした人</h1>
      <InfiniteList
        query={query}
        getKey={(user) => user.id}
        renderItem={(user) => <UserCardItem user={user} />}
        emptyMessage="まだいいねがありません"
        label="いいねした人"
      />
    </div>
  )
}
