import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { getPost } from '../api/posts'
import { NotFoundMessage } from '../components/NotFoundMessage'
import { Spinner } from '../components/Spinner'
import { PostItem } from '../features/posts/PostItem'
import { postKey } from '../features/posts/queryKeys'

// id が UUID でない（400）も、投稿が無い（404）も、打ち間違えた人にとっては「無い」。
function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 400 || error.status === 404)
}

// AppLayout の <main> の中に描かれるので、ここでは <main> を持たない。
export default function PostDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const query = useQuery({ queryKey: postKey(id), queryFn: () => getPost(id) })

  if (query.isPending) return <Spinner />
  if (query.isError) {
    if (isNotFound(query.error)) return <NotFoundMessage />
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p>読み込みに失敗しました</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="min-h-11 min-w-11 rounded-md border border-gray-400 bg-white px-4 text-black focus:outline-2 focus:outline-offset-2 focus:outline-sky-600"
        >
          再試行
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* スマホ幅は上部バーに同じ画面名が出るので、見出しは読み上げ用に残して見た目では隠す。 */}
      <h1 className="p-4 text-2xl font-bold max-md:sr-only">投稿</h1>
      <PostItem
        post={query.data}
        timeStyle="absolute"
        linkToDetail={false}
        onRemoved={() => void navigate('/', { replace: true })}
      />
    </div>
  )
}
