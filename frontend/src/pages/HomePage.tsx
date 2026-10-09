import { Link } from 'react-router'
import { InfiniteList } from '../components/InfiniteList'
import { PostForm } from '../features/posts/PostForm'
import { PostItem } from '../features/posts/PostItem'
import { useTimelineAll } from '../features/timeline/useTimelineAll'

// AppLayout の <main> の中に描かれるので、ここでは <main> を持たない（入れ子にしない）。
export default function HomePage() {
  const timeline = useTimelineAll()
  return (
    <div className="flex flex-col">
      {/* スマホ幅は上部バーに同じ画面名が出るので、見出しは読み上げ用に残して見た目では隠す。 */}
      <h1 className="p-4 text-2xl font-bold max-md:sr-only">ホーム</h1>
      <div className="border-b border-gray-200 p-4">
        <PostForm id="home-post-form" />
      </div>
      {/* タブは「すべて」だけ。「フォロー中」と URL の tab は、フォローの Issue で足す。 */}
      <nav aria-label="タイムラインの種類" className="flex border-b border-gray-200">
        <Link
          to="/"
          aria-current="page"
          className="inline-flex min-h-11 min-w-11 items-center border-b-2 border-sky-600 px-4 font-bold focus:outline-2 focus:outline-offset-2 focus:outline-sky-600"
        >
          すべて
        </Link>
      </nav>
      <InfiniteList
        query={timeline}
        getKey={(post) => post.id}
        renderItem={(post) => <PostItem post={post} timeStyle="relative" linkToDetail />}
        emptyMessage="まだ投稿がありません"
        label="タイムライン"
      />
    </div>
  )
}
