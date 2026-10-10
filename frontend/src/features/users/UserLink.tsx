import { Link } from 'react-router'
import type { UserSummary } from '../../api/posts'
import { Avatar } from '../../components/Avatar'

// 書いた人へのリンク。アイコン、表示名、@ユーザー名を 1 つのリンクにまとめ、プロフィールへ移る。
export function UserLink({ user }: { user: UserSummary }) {
  return (
    <Link to={`/users/${user.username}`} className="flex min-h-11 min-w-11 items-center gap-2 text-black hover:underline">
      <Avatar userId={user.id} displayName={user.displayName} avatarUrl={user.avatarUrl} />
      {/* 折り返すのは名前の部分だけ。リンク全体を折り返すと、長い表示名でアイコンだけが 1 行目に残る。 */}
      <span className="flex min-w-0 flex-wrap gap-x-2">
        <span className="font-bold [overflow-wrap:anywhere]">{user.displayName}</span>
        {/* 読み上げの名前が「アリス@alice」とくっつかないよう、空白を 1 つ置く（flex の中なので見た目には出ない）。 */}
        {' '}
        <span className="text-sm text-gray-600 [overflow-wrap:anywhere]">@{user.username}</span>
      </span>
    </Link>
  )
}
