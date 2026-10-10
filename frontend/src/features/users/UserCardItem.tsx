import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import type { UserCard } from '../../api/users'
import { shouldSkipCardNavigation } from '../../components/cardClick'
import { UserLink } from './UserLink'

// 一覧の 1 行に出すユーザー。フォローボタン（Issue 9）が中に入るので、カード全体は <a> にしない。
export function UserCardItem({ user }: { user: UserCard }) {
  const navigate = useNavigate()
  const profilePath = `/users/${user.username}`

  // 投稿カードの openDetail と同じ。リンク、ボタン、data-no-detail の上と、文字の選択の最中は動かない。
  function openProfile(event: MouseEvent<HTMLElement>) {
    if (shouldSkipCardNavigation(event)) return
    void navigate(profilePath)
  }

  return (
    // クリックでの移動はマウス向けの近道。キーボードと読み上げは、名前のリンクからプロフィールへ行ける。
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <article onClick={openProfile} className="cursor-pointer border-b border-gray-200 px-4 py-3 hover:bg-gray-50">
      <UserLink user={user} />
      {/* 改行はそのまま見せる。本文は文字として出すので、HTML は解釈されない。 */}
      {user.bio ? <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{user.bio}</p> : null}
    </article>
  )
}
