import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { ApiError } from '../api/client'
import { getUser } from '../api/users'
import { InfiniteList } from '../components/InfiniteList'
import { NotFoundMessage } from '../components/NotFoundMessage'
import { Spinner } from '../components/Spinner'
import { ProfileHeader } from '../features/profile/ProfileHeader'
import { userKey } from '../features/profile/queryKeys'
import { useUserPosts } from '../features/profile/useUserPosts'
import { PostItem } from '../features/posts/PostItem'

// ユーザー名が規則に合わない（400）も、その人がいない（404）も、打ち間違えた人にとっては「無い」。
function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 400 || error.status === 404)
}

// AppLayout の <main> の中に描かれるので、ここでは <main> を持たない。
export default function ProfilePage() {
  const { username = '' } = useParams()
  const query = useQuery({ queryKey: userKey(username), queryFn: () => getUser(username) })
  // 投稿一覧はプロフィールが取れてから引く。いない人で、プロフィールと一覧の 404 を 2 回出さないため。
  const posts = useUserPosts(username, query.isSuccess)

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
      {/* 見出し（h1）は表示名で、ProfileHeader の中にある。 */}
      <ProfileHeader user={query.data} />
      <InfiniteList
        query={posts}
        getKey={(post) => post.id}
        renderItem={(post) => <PostItem post={post} timeStyle="relative" linkToDetail />}
        emptyMessage="まだ投稿がありません"
        label="投稿一覧"
      />
    </div>
  )
}
