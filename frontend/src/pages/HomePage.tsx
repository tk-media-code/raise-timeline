import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { InfiniteList } from '../components/InfiniteList'
import { TabNav } from '../components/TabNav'
import { PostForm } from '../features/posts/PostForm'
import { PostItem } from '../features/posts/PostItem'
import { useTimeline, type TimelineKind } from '../features/timeline/useTimeline'

// 「フォロー中」が空のときは、次にすることを示す。
const EMPTY_MESSAGES: Record<TimelineKind, string> = {
  following: 'まだ投稿がありません。「すべて」から気になる人をフォローしてみましょう',
  all: 'まだ投稿がありません',
}

// AppLayout の <main> の中に描かれるので、ここでは <main> を持たない（入れ子にしない）。
export default function HomePage() {
  // 既定は「フォロー中」。?tab=all だけが「すべて」で、省略・following・知らない値は「フォロー中」。
  const [searchParams] = useSearchParams()
  const tab: TimelineKind = searchParams.get('tab') === 'all' ? 'all' : 'following'

  // この画面を開いてから表示したタブ。表示したタブの問い合わせは有効のまま持ち続け、切り替えで読み直さない。
  // 無効に戻すと、戻したときに古いデータとして読み直されてしまう。まだ開いていないタブは先読みしない。
  // 描画の最中に足すのは、effect で足すと 1 回余分に描き直すため（React が勧める「前の描画から状態を直す」書き方）。
  const [shown, setShown] = useState<ReadonlySet<TimelineKind>>(() => new Set([tab]))
  if (!shown.has(tab)) setShown(new Set(shown).add(tab))

  const following = useTimeline('following', tab === 'following' || shown.has('following'))
  const all = useTimeline('all', tab === 'all' || shown.has('all'))
  const timeline = tab === 'all' ? all : following

  return (
    <div className="flex flex-col">
      {/* スマホ幅は上部バーに同じ画面名が出るので、見出しは読み上げ用に残して見た目では隠す。 */}
      <h1 className="p-4 text-2xl font-bold max-md:sr-only">ホーム</h1>
      <div className="border-b border-gray-200 p-4">
        <PostForm id="home-post-form" />
      </div>
      <TabNav
        label="タイムラインの種類"
        tabs={[
          { to: '/?tab=following', label: 'フォロー中', current: tab === 'following' },
          { to: '/?tab=all', label: 'すべて', current: tab === 'all' },
        ]}
      />
      {/* 描く一覧は表示中のタブの 1 つだけ。key を変えて、タブごとに一覧の状態（読み込みの監視）を作り直す。 */}
      <InfiniteList
        key={tab}
        query={timeline}
        getKey={(post) => post.id}
        renderItem={(post) => <PostItem post={post} timeStyle="relative" linkToDetail />}
        emptyMessage={EMPTY_MESSAGES[tab]}
        label="タイムライン"
      />
    </div>
  )
}
