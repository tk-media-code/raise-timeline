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
      // 「解除」は「フォロー中」の上に重ね、幅は常に「フォロー中」が決める。フォントによらず、替わっても幅が変わらない。
      // 右端に置くので、幅が縮むとボタンの左端がポインタの下から外れ、ホバーが切れて「フォロー中」に戻り、ちらつく
      // （ユーザーカードでは、その帯を押すと <article> に当たってプロフィールが開く）。
      // 幅の下限は「フォロー中」の幅（全角 5 文字 + 左右の余白 2rem + 枠 2px）。「フォロー」でも「解除」でも同じ幅になり、
      // 解除してもボタンの左端が動かない。プロトタイプの 104px（min-w-26）は、文字が 16px のときは「フォロー中」より約 10px 狭く、解除で縮んだ。
      // 文字を 14px（text-sm）にした今は、この式がちょうど 104px になる（プロトタイプと同じ）。
      className={`group relative min-h-11 min-w-[calc(5em+2rem+2px)] shrink-0 rounded-full px-4 text-sm font-bold focus:outline-2 focus:outline-offset-2 focus:outline-sky-600 ${
        following
          ? `border border-gray-400 bg-white text-black ${justToggled ? '' : 'hover:border-red-700 hover:bg-red-50 hover:text-red-700'}`
          : 'bg-sky-600 text-white hover:bg-sky-700'
      }`}
    >
      {following ? (
        <>
          {/* マウスを載せると「解除」に替わる。名前（aria-label）が「押すと解除」を伝えるので、読み上げには出さない。 */}
          {/* 「フォロー中」は invisible にするだけで、場所は残す（hidden にすると幅が「解除」の分に縮む）。 */}
          <span className={justToggled ? '' : 'group-hover:invisible'}>フォロー中</span>
          {justToggled ? null : (
            <span aria-hidden="true" className="absolute inset-0 hidden items-center justify-center group-hover:flex">
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
