import { ApiError } from '../../api/client'

export const POST_IMAGE_MAX_BYTES = 5_242_880
export const AVATAR_MAX_BYTES = 2_097_152
export const POST_IMAGE_MAX_COUNT = 4
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp'

export const IMAGE_COUNT_MESSAGE = '画像は 4 枚までです'
export const IMAGE_TYPE_MESSAGE = 'JPEG、PNG、GIF、WebP の画像を選んでください'

const ALLOWED_MIME = new Set(IMAGE_ACCEPT.split(','))
const ALLOWED_EXTENSION = /\.(jpe?g|png|gif|webp)$/i

// 上限の大きさ（バイト）から「画像は 5 MB 以内にしてください」を作る。1 MB は 1,048,576 バイト。
export function sizeMessage(maxBytes: number): string {
  return `画像は ${maxBytes / 1_048_576} MB 以内にしてください`
}

// 選んだ時点の検査。通れば null、通らなければ利用者に見せる文言を返す。
// 形式を先に見る: SVG を選んだ人に「大きすぎる」と言うと、小さくすれば通ると誤解させる。
// MIME が空のことがある（OS が拡張子を知らないとき）ので、拡張子でも通す。サーバーが中身で最終的に判定する。
export function checkImageFile(file: File, maxBytes: number): string | null {
  if (!ALLOWED_MIME.has(file.type) && !ALLOWED_EXTENSION.test(file.name)) return IMAGE_TYPE_MESSAGE
  if (file.size > maxBytes) return sizeMessage(maxBytes)
  return null
}

// サーバーが 413 / 415 で断ったときの、画像の欄に出す文言。ほかの失敗は null（画面ごとに決める）。
// 画面で先に検査しているので普通は届かない。MIME を偽ったファイルや、設定の食い違いが通ったときの備え。
export function imageRejectionMessage(error: unknown, maxBytes: number): string | null {
  if (!(error instanceof ApiError)) return null
  if (error.status === 413) return sizeMessage(maxBytes)
  if (error.status === 415) return IMAGE_TYPE_MESSAGE
  return null
}

// 選んだ画像。previewUrl は URL.createObjectURL の値で、使い終わったら releaseImages で解放する。
export type SelectedImage = { id: string; file: File; previewUrl: string }

let nextId = 0

// id は一覧の key 用。同じファイルを 2 回選んでも別の画像として扱えるよう、連番にする。
export function selectImage(file: File): SelectedImage {
  return { id: `image-${++nextId}`, file, previewUrl: URL.createObjectURL(file) }
}

export function releaseImages(images: SelectedImage[]): void {
  for (const image of images) URL.revokeObjectURL(image.previewUrl)
}
