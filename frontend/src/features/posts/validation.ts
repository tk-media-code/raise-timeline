import { countCodePoints } from '../../lib/text'

export const POST_BODY_MAX = 280

// 残りの文字数。超えているときは負になる。
export function remainingChars(body: string): number {
  return POST_BODY_MAX - countCodePoints(body)
}

// 空白と改行だけの本文は、空と同じに扱って送らせない（サーバーも strip() して空なら 422 にする）。
export function canSubmitBody(body: string): boolean {
  return body.trim() !== '' && remainingChars(body) >= 0
}
