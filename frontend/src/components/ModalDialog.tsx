import { useEffect, useRef, type ReactNode } from 'react'

type ModalDialogProps = {
  open: boolean
  // 見出しの id。ダイアログの名前になる。
  labelledBy: string
  onCancel: () => void
  children: ReactNode
}

// <dialog> の枠。ConfirmDialog と同じく、開閉の正は props の open で、showModal() / close() はそれに合わせるだけにする。
// 中身は開いている間だけ描く。閉じるたびに入力欄が新しくなり、隠れた入力欄が読み上げや検索に残らない。
export function ModalDialog({ open, labelledBy, onCancel, children }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
      // 中身が先に描かれた時点ではダイアログが開いていないので、React の autoFocus は空振りする。開いてから改めて合わせる。
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
      // 閉じたら、開く前にいた場所へ戻す。ブラウザも戻すが、押した項目が消えていると body に落ちる。
      const target = returnFocusRef.current
      returnFocusRef.current = null
      if (target?.isConnected) target.focus()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      // Esc はブラウザが閉じる前に cancel イベントを出す。そのまま閉じさせず、閉じる判断は呼び出し側の状態に任せる。
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      className="m-auto w-[min(92vw,32rem)] rounded-lg bg-white p-4 text-black shadow-xl backdrop:bg-black/40"
    >
      {open && children}
    </dialog>
  )
}
