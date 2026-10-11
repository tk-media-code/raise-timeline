import { Link } from 'react-router'
import type { UserDetail } from '../../api/users'
import { Avatar } from '../../components/Avatar'
import { FollowButton } from '../follows/FollowButton'
import { formatJoined } from './formatJoined'

// 「フォロー中 n」「フォロワー n」は一覧の画面へのリンク。
// 数は 1 つの文字列にする（「フォロー中」と数を別の要素にすると、読み上げが途切れる）。
const COUNT_LINK = 'inline-flex min-h-11 min-w-11 items-center hover:underline focus:outline-2 focus:outline-offset-2 focus:outline-sky-600'

export function ProfileHeader({ user }: { user: UserDetail }) {
  return (
    <section className="flex flex-col gap-3 border-b border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <Avatar userId={user.id} displayName={user.displayName} avatarUrl={user.avatarUrl} size={72} />
        {user.isMe ? (
          <Link
            to="/settings/profile"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-gray-400 bg-white px-4 text-black focus:outline-2 focus:outline-offset-2 focus:outline-sky-600"
          >
            プロフィールを編集
          </Link>
        ) : (
          // key は、同じ画面のままほかの人のプロフィールへ移ったときに、ボタンの状態（押した直後の印）を作り直すため。
          <FollowButton key={user.id} user={user} />
        )}
      </div>
      <div className="min-w-0">
        {/* 長い名前は、空白が無くても折り返して横にはみ出させない。 */}
        <h1 className="text-2xl font-bold [overflow-wrap:anywhere]">{user.displayName}</h1>
        <p className="text-gray-600 [overflow-wrap:anywhere]">@{user.username}</p>
      </div>
      {/* 改行はそのまま見せる。本文は文字として出すので、HTML は解釈されない。 */}
      {user.bio ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{user.bio}</p> : null}
      <p className="text-sm text-gray-600">{formatJoined(user.createdAt)}</p>
      <div className="flex gap-4">
        <Link to={`/users/${user.username}/following`} className={COUNT_LINK}>{`フォロー中 ${user.followingCount}`}</Link>
        <Link to={`/users/${user.username}/followers`} className={COUNT_LINK}>{`フォロワー ${user.followersCount}`}</Link>
      </div>
    </section>
  )
}
