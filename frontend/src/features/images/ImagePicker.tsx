import { useId, useRef, type ChangeEvent } from 'react'
import {
  IMAGE_ACCEPT,
  IMAGE_COUNT_MESSAGE,
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_MAX_COUNT,
  checkImageFile,
  releaseImages,
  selectImage,
  type SelectedImage,
} from './imageFiles'

type ImagePickerProps = {
  images: SelectedImage[]
  // 画像の並びが変わったときに呼ぶ。message は欄の下に出す文言（誤りが無ければ null）。
  onChange: (next: SelectedImage[], message: string | null) => void
  // 欄の下に出す誤り。選んだ時点の検査と、サーバーの断りの両方がここに出る。
  error?: string | null
  // 送信中。追加も取り消しも止める（送信は File のまま続くので、見た目の並びと送る中身をずらさない）。
  disabled?: boolean
}

// 投稿に付ける画像の選択と、プレビュー・取り消し。状態は持たず、並びは親が持つ（送るのは親なので）。
// 4 枚のときも「画像を追加」は押せる。5 枚目を選んだ人に「4 枚までです」を伝えるため。
export function ImagePicker({ images, onChange, error, disabled }: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()

  function add(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const files = Array.from(input.files ?? [])
    // 同じファイルをもう一度選んでも change が起きるよう、読み終えたら空にする。
    input.value = ''
    if (files.length === 0) return

    const next = [...images]
    let message: string | null = null
    for (const file of files) {
      const problem = checkImageFile(file, POST_IMAGE_MAX_BYTES)
      if (problem) {
        message = problem
        continue
      }
      if (next.length >= POST_IMAGE_MAX_COUNT) {
        message = IMAGE_COUNT_MESSAGE
        break
      }
      next.push(selectImage(file))
    }
    onChange(next, message)
  }

  function remove(target: SelectedImage) {
    releaseImages([target])
    onChange(
      images.filter((image) => image.id !== target.id),
      null,
    )
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <li key={image.id} className="relative size-24 overflow-hidden rounded-md border border-gray-200 bg-gray-100">
              <img src={image.previewUrl} alt={`選んだ画像 ${index + 1}`} className="size-full object-cover" />
              <button
                type="button"
                aria-label={`画像 ${index + 1} を取り消す`}
                disabled={disabled}
                onClick={() => remove(image)}
                className="absolute top-0 right-0 flex min-h-11 min-w-11 items-center justify-center rounded-bl-md bg-black/70 text-xl leading-none text-white hover:bg-black focus:outline-2 focus:-outline-offset-2 focus:outline-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* 名前は読み上げ用。見える操作は隣の「画像を追加」ボタンで、入力欄そのものは隠す。 */}
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept={IMAGE_ACCEPT}
        aria-label="投稿に付ける画像"
        onChange={add}
      />
      <button
        type="button"
        disabled={disabled}
        aria-describedby={error ? errorId : undefined}
        onClick={() => inputRef.current?.click()}
        className="min-h-11 min-w-11 rounded-full border border-sky-600 px-4 font-bold text-sky-700 hover:bg-sky-50 focus:outline-2 focus:outline-offset-2 focus:outline-sky-600 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-500 disabled:hover:bg-transparent"
      >
        画像を追加
      </button>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
