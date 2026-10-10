import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import type { FollowTarget } from './followCache'
import { useToggleFollow } from './useToggleFollow'

// フォロー／解除のボタン。自分には何も出さない。
// 表示はキャッシュから来る user.isFollowing に従う（押した瞬間に useToggleFollow がキャッシュを書き換え、props が変わる）。
// 呼び出し側は、対象が変わりうる場所（プロフィール）では key={user.id} を付けて作り直す。
export function FollowButton({ user }: { user: FollowTarget }) {
  const { user: me } = useAuth()
  const toggle = useToggleFollow(user)
  // 押した直後は、ポインタが離れるかフォーカスが外れるまで「解除」を出さない。
  // 押した瞬間に「解除」と出ると、解除してしまったように見える。
  const [justToggled, setJustToggled] = useState(false)

  if (me?.id === user.id) return null

  const following = user.isFollowing
  const settle = () => setJustToggled(false)

  return (
    <button
      type="button"
      aria-label={following ? `${user.displayName}さんをフォロー中（押すと解除）` : `${user.displayName}さんをフォロー`}
      onClick={() => {
        setJustToggled(true)
        toggle()
      }}
      onMouseLeave={settle}
      onBlur={settle}
      className={`group min-h-11 min-w-11 shrink-0 rounded-full px-4 font-bold focus:outline-2 focus:outline-offset-2 focus:outline-sky-600 ${
        following
          ? `border border-gray-400 bg-white text-black ${justToggled ? '' : 'hover:border-red-300 hover:text-red-600'}`
          : 'bg-sky-600 text-white hover:bg-sky-700'
      }`}
    >
      {following ? (
        <>
          {/* マウスを載せると「解除」に替わる。名前（aria-label）が「押すと解除」を伝えるので、読み上げには出さない。 */}
          <span className={justToggled ? '' : 'group-hover:hidden'}>フォロー中</span>
          {justToggled ? null : (
            <span aria-hidden="true" className="hidden group-hover:inline">
              解除
            </span>
          )}
        </>
      ) : (
        'フォロー'
      )}
    </button>
  )
}
