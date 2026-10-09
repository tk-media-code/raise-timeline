import { useQuery } from '@tanstack/react-query'
import { getMe } from '../api/users'
import { RetryMessage } from '../components/RetryMessage'
import { Spinner } from '../components/Spinner'
import { ProfileForm } from '../features/profile/ProfileForm'
import { meKey } from '../features/profile/queryKeys'

// AppLayout の <main> の中に描かれるので、ここでは <main> を持たない。
export default function ProfileEditPage() {
  // 開くたびに取り直し、取れるまで読み込み中にする。gcTime: 0 で、前に開いたときの値も残さない。
  // 別のタブで先に変えていたとき、古い値を初期値にして上書きしてしまうのを防ぐため。
  // ログイン中の利用者（useAuth().user）を初期値にしない理由も同じ: 他のタブの変更は、そちらには届いていない。
  const query = useQuery({ queryKey: meKey, queryFn: getMe, gcTime: 0 })

  if (query.isPending) return <Spinner />
  if (query.isError) return <RetryMessage onRetry={() => void query.refetch()} />

  return (
    <div className="flex flex-col">
      {/* スマホ幅は上部バーに同じ画面名が出るので、見出しは読み上げ用に残して見た目では隠す。 */}
      <h1 className="p-4 text-2xl font-bold max-md:sr-only">プロフィール編集</h1>
      <ProfileForm me={query.data} />
    </div>
  )
}
