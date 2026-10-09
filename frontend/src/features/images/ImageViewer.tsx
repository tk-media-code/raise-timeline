import { useEffect, useState } from 'react'
import type { PostImage } from '../../api/posts'
import { ModalDialog } from '../../components/ModalDialog'

type ImageViewerProps = {
  images: PostImage[]
  // 開いたとき最初に出す画像の位置（0 始まり）。
  startIndex: number
  open: boolean
  onClose: () => void
}

// 画面いっぱいの暗い背景。dialog の既定（中央寄せ・最大幅）を打ち消して全面に広げる。
// 幅は dvw ではなく w-full にする。100dvw は縦スクロールバーの幅を含むので、スクロールバーのある環境では
// 見える範囲より広くなり、右端のボタンの一部がスクロールバーの下に隠れて押せなくなる。
// 高さの dvh は、モバイルでアドレスバーの出入りに追従させるために使う。
const DIALOG_CLASS = 'fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-black/90 p-0 text-white backdrop:bg-transparent'

const BUTTON_CLASS =
  'absolute flex size-12 items-center justify-center rounded-full bg-white text-3xl leading-none text-black hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

// 画像を大きく見るビューア。背景か × か Esc で閉じ、複数枚は左右のボタンと矢印キーで移る。
// 中身は開いている間だけ描かれるので、開くたびに startIndex から始まる。
export function ImageViewer({ images, startIndex, open, onClose }: ImageViewerProps) {
  return (
    <ModalDialog open={open} label="画像" onCancel={onClose} className={DIALOG_CLASS}>
      <ViewerBody images={images} startIndex={startIndex} onClose={onClose} />
    </ModalDialog>
  )
}

// 端で止めずに反対側へ回る。
function wrap(current: number, step: number, length: number): number {
  return (current + step + length) % length
}

function ViewerBody({ images, startIndex, onClose }: Omit<ImageViewerProps, 'open'>) {
  const [index, setIndex] = useState(startIndex)
  const many = images.length > 1
  const image = images[index]

  function move(step: number) {
    setIndex((current) => wrap(current, step, images.length))
  }

  // 矢印キー。ダイアログの中のどこにフォーカスがあっても効くよう、要素ではなく document で受ける。
  // （この部品は開いている間だけ描かれるので、閉じれば外れる。）
  useEffect(() => {
    if (!many) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') setIndex((current) => wrap(current, -1, images.length))
      else if (event.key === 'ArrowRight') setIndex((current) => wrap(current, 1, images.length))
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [many, images.length])

  if (!image) return null

  return (
    <>
      {/* 背景（画像とボタン以外）を押すと閉じる。マウス向けの近道で、キーボードと読み上げには「閉じる」ボタンと Esc がある。 */}
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
        className="flex h-full w-full items-center justify-center px-16 py-14"
      >
        <img
          src={image.url}
          alt={many ? `画像 ${index + 1} / ${images.length}` : '画像'}
          className="max-h-full max-w-full object-contain"
        />
      </div>
      {/* フォーカスは「閉じる」から始める（ModalDialog が data-autofocus に合わせる）。 */}
      <button
        type="button"
        data-autofocus
        aria-label="閉じる"
        onClick={onClose}
        className={`${BUTTON_CLASS} top-2 right-2`}
      >
        <span aria-hidden="true">×</span>
      </button>
      {many && (
        <>
          <button
            type="button"
            aria-label="前の画像"
            onClick={() => move(-1)}
            className={`${BUTTON_CLASS} top-1/2 left-2 -translate-y-1/2`}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            aria-label="次の画像"
            onClick={() => move(1)}
            className={`${BUTTON_CLASS} top-1/2 right-2 -translate-y-1/2`}
          >
            <span aria-hidden="true">›</span>
          </button>
        </>
      )}
    </>
  )
}
