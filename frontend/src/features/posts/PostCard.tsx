import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Post } from '../../api/posts'
import { Avatar } from '../../components/Avatar'
import { formatAbsoluteTime, formatRelativeTime } from './formatTime'
import { PostBody } from './PostBody'

type PostCardProps = {
  post: Post
  isMine: boolean
  timeStyle: 'relative' | 'absolute'
  // true なら、カードの余白や本文を押すと投稿詳細へ移る。詳細画面では false にする。
  linkToDetail: boolean
  onEdit?: () => void
  onDelete?: () => void
  now?: Date
}

const MENU_ITEM_CLASS = 'flex min-h-11 w-full items-center rounded-md px-3 text-left text-black hover:bg-gray-100'

// 投稿 1 件の表示。操作（編集・削除）は呼び出し側に任せ、ここでは認証も通信も扱わない。
export function PostCard({ post, isMine, timeStyle, linkToDetail, onEdit, onDelete, now }: PostCardProps) {
  const navigate = useNavigate()
  const { author } = post
  const timeText =
    timeStyle === 'relative' ? formatRelativeTime(post.createdAt, now ?? new Date()) : formatAbsoluteTime(post.createdAt)

  // リンク、ボタン、メニューの枠（data-no-detail）、文字の選択の最中は、カードの移動より本来の操作を優先する。
  function openDetail(event: MouseEvent<HTMLElement>) {
    if (!linkToDetail) return
    const target = event.target
    if (target instanceof Element) {
      const interactive = target.closest('a, button, [data-no-detail]')
      if (interactive && event.currentTarget.contains(interactive)) return
    }
    if (window.getSelection()?.toString()) return
    void navigate(`/posts/${post.id}`)
  }

  return (
    // クリックでの移動はマウス向けの近道。キーボードと読み上げは、時刻のリンクから詳細へ行ける。
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <article
      onClick={openDetail}
      className={`border-b border-gray-200 px-4 py-3 ${linkToDetail ? 'cursor-pointer hover:bg-gray-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/users/${author.username}`}
          className="flex min-h-11 min-w-11 flex-wrap items-center gap-x-2 text-black hover:underline"
        >
          <Avatar userId={author.id} displayName={author.displayName} avatarUrl={author.avatarUrl} />
          <span className="font-bold [overflow-wrap:anywhere]">{author.displayName}</span>
          {/* 読み上げの名前が「アリス@alice」とくっつかないよう、空白を 1 つ置く（flex の中なので見た目には出ない）。 */}
          {' '}
          <span className="text-sm text-gray-600 [overflow-wrap:anywhere]">@{author.username}</span>
        </Link>
        {isMine && <PostMenu onEdit={onEdit} onDelete={onDelete} />}
      </div>

      <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
        <Link to={`/posts/${post.id}`} className="inline-flex min-h-11 min-w-11 items-center hover:underline">
          <time dateTime={post.createdAt} title={formatAbsoluteTime(post.createdAt)}>
            {timeText}
          </time>
        </Link>
        {post.edited && <span>編集済み</span>}
      </div>

      <div className="mt-1">
        <PostBody body={post.body} />
      </div>

      {/* いいねとコメントはまだ押せない。押せるボタンに見えないよう role="img" の表示にする（操作は後の Issue が足す）。 */}
      <div className="mt-2 flex gap-6 text-sm text-gray-600">
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- 文字を持つ表示なので <img> にはできない */}
        <span role="img" aria-label={`いいね ${post.likeCount} 件`}>
          <span aria-hidden="true">♡ {post.likeCount}</span>
        </span>
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- 同上 */}
        <span role="img" aria-label={`コメント ${post.commentCount} 件`}>
          <span aria-hidden="true">💬 {post.commentCount}</span>
        </span>
      </div>
    </article>
  )
}

function PostMenu({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  // 開いている間だけ、Esc とメニューの外の押下を見る。
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && containerRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  function choose(action?: () => void) {
    setOpen(false)
    action?.()
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="この投稿の操作"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-xl hover:bg-gray-100"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div
          id={menuId}
          data-no-detail
          className="absolute right-0 z-10 mt-1 w-32 rounded-md border border-gray-200 bg-white p-1 shadow-lg"
        >
          <button type="button" onClick={() => choose(onEdit)} className={MENU_ITEM_CLASS}>
            編集
          </button>
          <button type="button" onClick={() => choose(onDelete)} className={MENU_ITEM_CLASS}>
            削除
          </button>
        </div>
      )}
    </div>
  )
}
