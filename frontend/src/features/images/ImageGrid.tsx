import { useState } from 'react'
import type { PostImage } from '../../api/posts'
import { ImageViewer } from './ImageViewer'

type ImageGridProps = {
  images: PostImage[]
  // true なら画像を押してビューアで見られる（カード）。false は見せるだけ（編集ダイアログ）。
  interactive: boolean
}

// 枚数ごとの枠の割り付け。1 枚は全体、2 枚は横並び、3 枚は左 1（2 行分）と右 2、4 枚は 2×2。
const LAYOUT: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 grid-rows-2 [&>:first-child]:row-span-2',
  4: 'grid-cols-2 grid-rows-2',
}

// 投稿の画像の並び。16:9 の枠に cover で敷き詰める（縦横比の違う画像でもタイムラインの高さが揃う）。
// 枠は data-no-detail にする。ビューアの <dialog> はこの枠の子孫なので、中の押下がカードの「詳細へ移る」に届かないようにする。
export function ImageGrid({ images, interactive }: ImageGridProps) {
  // 開いているビューアの先頭の画像。null なら閉じている。
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  if (images.length === 0) return null

  // min-h-11 min-w-11 は押す大きさの下限。セルは大きいが、grid の auto の最小幅（画像の原寸）で広がらないよう明示も兼ねる。
  const cellClass = 'block min-h-11 min-w-11 overflow-hidden bg-gray-100'
  const imageClass = 'block h-full w-full object-cover'

  return (
    <div
      data-no-detail
      className={`mt-2 grid aspect-video gap-0.5 overflow-hidden rounded-xl border border-gray-200 ${LAYOUT[images.length] ?? LAYOUT[4]}`}
    >
      {images.map((image, index) =>
        interactive ? (
          <button
            key={image.id}
            type="button"
            aria-label={`画像 ${index + 1} を拡大`}
            onClick={() => setViewerIndex(index)}
            className={`${cellClass} cursor-zoom-in p-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-600`}
          >
            {/* 名前はボタンが持つので、画像は装飾にする（二重に読み上げない）。 */}
            <img src={image.url} alt="" loading="lazy" className={imageClass} />
          </button>
        ) : (
          <div key={image.id} className={cellClass}>
            <img src={image.url} alt={`添付画像 ${index + 1}`} loading="lazy" className={imageClass} />
          </div>
        ),
      )}
      {interactive && (
        <ImageViewer
          images={images}
          startIndex={viewerIndex ?? 0}
          open={viewerIndex !== null}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  )
}
