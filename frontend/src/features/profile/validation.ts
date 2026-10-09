import { countCodePoints } from '../../lib/text'

export const BIO_MAX = 160

// 残りの文字数。超えているときは負になる。
// サーバーは CRLF を LF に直してから数える。textarea の値はふつう LF だが、そろえて数える。
export function bioRemaining(bio: string): number {
  return BIO_MAX - countCodePoints(bio.replaceAll('\r\n', '\n'))
}
