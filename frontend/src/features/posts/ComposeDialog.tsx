import { useIsMutating } from '@tanstack/react-query'
import { useId } from 'react'
import { ModalDialog } from '../../components/ModalDialog'
import { CREATE_POST_KEY } from './mutations'
import { PostForm } from './PostForm'

type ComposeDialogProps = { open: boolean; onClose: () => void }

// 新しい投稿のダイアログ。ホームの常設フォーム（id は home-post-form）とは別のフォームなので、id を分ける。
export function ComposeDialog({ open, onClose }: ComposeDialogProps) {
  const titleId = useId()
  // 送信中に閉じると、失敗しても誤りを見せられず、入力も戻らない。送信が終わるまで、Esc と「閉じる」は効かせない。
  // 投稿できたときの閉じ方（onPosted）は送信が終わった後なので、そのまま onClose を呼ぶ。
  const sending = useIsMutating({ mutationKey: CREATE_POST_KEY }) > 0
  function close() {
    if (!sending) onClose()
  }
  return (
    <ModalDialog open={open} labelledBy={titleId} onCancel={close}>
      <div className="mb-3 flex items-center justify-between">
        <h2 id={titleId} className="text-lg font-bold">
          新しい投稿
        </h2>
        <button
          type="button"
          aria-label="閉じる"
          onClick={close}
          disabled={sending}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-xl hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- 投稿のために開いたダイアログなので、入力欄から始める */}
      <PostForm id="compose-post-form" autoFocus onPosted={onClose} />
    </ModalDialog>
  )
}
