import { useId } from 'react'
import { ModalDialog } from '../../components/ModalDialog'
import { PostForm } from './PostForm'

type ComposeDialogProps = { open: boolean; onClose: () => void }

// 新しい投稿のダイアログ。ホームの常設フォーム（id は home-post-form）とは別のフォームなので、id を分ける。
export function ComposeDialog({ open, onClose }: ComposeDialogProps) {
  const titleId = useId()
  return (
    <ModalDialog open={open} labelledBy={titleId} onCancel={onClose}>
      <div className="mb-3 flex items-center justify-between">
        <h2 id={titleId} className="text-lg font-bold">
          新しい投稿
        </h2>
        <button
          type="button"
          aria-label="閉じる"
          onClick={onClose}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-xl hover:bg-gray-100"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- 投稿のために開いたダイアログなので、入力欄から始める */}
      <PostForm id="compose-post-form" autoFocus onPosted={onClose} />
    </ModalDialog>
  )
}
