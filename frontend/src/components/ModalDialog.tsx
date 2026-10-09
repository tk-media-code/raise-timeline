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
    } else if (!open) {
      // ブラウザが先に閉じていた場合（下の onClose）も通る。dialog.open が false なら close() は要らない。
      if (dialog.open) dialog.close()
      // 閉じたら、開く前にいた場所へ明示的に戻す。open が false になった描画で中身（フォーカスのあった入力欄）が
      // close() より先に消えてフォーカスが body に落ちるので、ブラウザの復元に頼らない。
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
      // ブラウザが利用者の操作とは別に閉じることがある（Esc を重ねたときの強制的な close、Android の戻る操作など）。
      // 親の open が true のままだと、親の状態と画面が食い違い、以後開き直せなくなる。親がまだ開いていると思っていれば閉じさせる。
      // 親の指示で閉じた場合は、この時点で open が false なので何もしない。
      onClose={() => {
        if (open) onCancel()
      }}
      className="m-auto w-[min(92vw,32rem)] rounded-lg bg-white p-4 text-black shadow-xl backdrop:bg-black/40"
    >
      {open && children}
    </dialog>
  )
}
