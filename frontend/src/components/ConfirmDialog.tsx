import { useEffect, useId, useRef } from 'react'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

// <dialog> で作る確認ダイアログ。開閉の正は props の open で、showModal() / close() はそれに合わせるだけにする。
// 取り消しを既定のボタンにするのは、確認を読まずに Enter を押しても取り返しのつかないことが起きないようにするため。
export function ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
      // showModal() も最初に見つかった操作できる要素へフォーカスを置くが、順序に頼らず取り消しに固定する。
      cancelRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
      // 閉じたら、開く前にいた場所へ明示的にフォーカスを戻す。ブラウザの close() も戻すが、jsdom など戻さない実装でも
      // 同じ動きにして、テストで確かめられるようにする。
      const target = returnFocusRef.current
      returnFocusRef.current = null
      if (target?.isConnected) target.focus()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      // Esc はブラウザが閉じる前に cancel イベントを出す。そのまま閉じさせず、閉じる判断は呼び出し側の状態に任せる。
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      className="m-auto w-[min(90vw,24rem)] rounded-lg bg-white p-6 text-black shadow-xl backdrop:bg-black/40"
    >
      <h2 id={titleId} className="text-lg font-bold">
        {title}
      </h2>
      <p className="mt-2 text-sm text-gray-700">{description}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-md border border-gray-400 bg-white px-4 text-black focus:outline-2 focus:outline-offset-2 focus:outline-sky-600"
        >
          取り消し
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-11 rounded-md bg-sky-600 px-4 font-bold text-white focus:outline-2 focus:outline-offset-2 focus:outline-sky-600"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
