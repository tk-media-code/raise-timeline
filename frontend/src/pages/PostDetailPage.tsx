import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { isNotFound } from '../api/client'
import { getPost } from '../api/posts'
import { NotFoundMessage } from '../components/NotFoundMessage'
import { RetryMessage } from '../components/RetryMessage'
import { Spinner } from '../components/Spinner'
import { CommentSection } from '../features/comments/CommentSection'
import { PostItem } from '../features/posts/PostItem'
import { postKey } from '../features/posts/queryKeys'

// AppLayout の <main> の中に描かれるので、ここでは <main> を持たない。
export default function PostDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const query = useQuery({ queryKey: postKey(id), queryFn: () => getPost(id) })

  if (query.isPending) return <Spinner />
  if (query.isError) {
    if (isNotFound(query.error)) return <NotFoundMessage />
    return <RetryMessage onRetry={() => void query.refetch()} />
  }

  const goHome = () => void navigate('/', { replace: true })

  return (
    <div className="flex flex-col">
      {/* スマホ幅は上部バーに同じ画面名が出るので、見出しは読み上げ用に残して見た目では隠す。 */}
      <h1 className="p-4 text-2xl font-bold max-md:sr-only">投稿</h1>
      <PostItem
        post={query.data}
        timeStyle="absolute"
        linkToDetail={false}
        showLikersLink
        onRemoved={goHome}
      />
      {/* key で、URL の投稿 id が変わったら節ごと作り直す（書き込みの処理は postId を持ち、入力途中の本文も別の投稿へ持ち越さない）。 */}
      <CommentSection key={id} postId={id} onPostGone={goHome} />
    </div>
  )
}
