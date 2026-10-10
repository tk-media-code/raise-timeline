import type { MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import type { UserCard } from '../../api/users'
import { Avatar } from '../../components/Avatar'

// 一覧の 1 行に出すユーザー。フォローボタン（Issue 9）が中に入るので、カード全体は <a> にしない。
export function UserCardItem({ user }: { user: UserCard }) {
  const navigate = useNavigate()
  const profilePath = `/users/${user.username}`

  // 投稿カードの openDetail と同じ。リンク、ボタン、data-no-detail の上と、文字の選択の最中は動かない。
  function openProfile(event: MouseEvent<HTMLElement>) {
    const target = event.target
    if (target instanceof Element) {
      const interactive = target.closest('a, button, [data-no-detail]')
      if (interactive && event.currentTarget.contains(interactive)) return
    }
    if (window.getSelection()?.toString()) return
    void navigate(profilePath)
  }

  return (
    // クリックでの移動はマウス向けの近道。キーボードと読み上げは、名前のリンクからプロフィールへ行ける。
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <article onClick={openProfile} className="cursor-pointer border-b border-gray-200 px-4 py-3 hover:bg-gray-50">
      <Link to={profilePath} className="flex min-h-11 min-w-11 items-center gap-2 text-black hover:underline">
        <Avatar userId={user.id} displayName={user.displayName} avatarUrl={user.avatarUrl} />
        {/* 折り返すのは名前の部分だけ。リンク全体を折り返すと、長い表示名でアイコンだけが 1 行目に残る。 */}
        <span className="flex min-w-0 flex-wrap gap-x-2">
          <span className="font-bold [overflow-wrap:anywhere]">{user.displayName}</span>
          {/* 読み上げの名前が「アリス@alice」とくっつかないよう、空白を 1 つ置く（flex の中なので見た目には出ない）。 */}
          {' '}
          <span className="text-sm text-gray-600 [overflow-wrap:anywhere]">@{user.username}</span>
        </span>
      </Link>
      {/* 改行はそのまま見せる。本文は文字として出すので、HTML は解釈されない。 */}
      {user.bio ? <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{user.bio}</p> : null}
    </article>
  )
}
