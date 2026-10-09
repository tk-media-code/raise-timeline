import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { isNotFound } from '../api/client'
import { getUser } from '../api/users'
import { InfiniteList } from '../components/InfiniteList'
import { NotFoundMessage } from '../components/NotFoundMessage'
import { RetryMessage } from '../components/RetryMessage'
import { Spinner } from '../components/Spinner'
import { USERNAME_PATTERN } from '../features/auth/validation'
import { ProfileHeader } from '../features/profile/ProfileHeader'
import { userKey } from '../features/profile/queryKeys'
import { useUserPosts } from '../features/profile/useUserPosts'
import { PostItem } from '../features/posts/PostItem'

// AppLayout の <main> の中に描かれるので、ここでは <main> を持たない。
export default function ProfilePage() {
  const { username = '' } = useParams()
  // 規則に合わない名前の人はいない。`/users/me` をそのまま引くと、固定の `/api/users/me`（自分の情報）に当たって
  // 自分のプロフィールが出てしまう。サーバーの Usernames と同じ規則で、API を呼ばずに「見つかりません」にする。
  const possible = USERNAME_PATTERN.test(username)
  const query = useQuery({ queryKey: userKey(username), queryFn: () => getUser(username), enabled: possible })
  // 投稿一覧はプロフィールが取れてから引く。いない人で、プロフィールと一覧の 404 を 2 回出さないため。
  const posts = useUserPosts(username, query.isSuccess)

  if (!possible) return <NotFoundMessage />
  if (query.isPending) return <Spinner />
  if (query.isError) {
    if (isNotFound(query.error)) return <NotFoundMessage />
    return <RetryMessage onRetry={() => void query.refetch()} />
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
