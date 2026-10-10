import { countCodePoints } from '../../lib/text'

export const POST_BODY_MAX = 280

// 残りの文字数。超えているときは負になる。
export function remainingChars(body: string): number {
  return POST_BODY_MAX - countCodePoints(body)
}

// 空白と改行だけの本文は、空と同じに扱って送らせない（サーバーも strip() して空なら 422 にする）。
// ただし画像が付いているなら、本文が空でも投稿として成り立つ（画像だけの投稿）。文字数の超過はどちらでも送らせない。
export function canSubmitBody(body: string, hasImages: boolean): boolean {
  return (hasImages || body.trim() !== '') && remainingChars(body) >= 0
}
