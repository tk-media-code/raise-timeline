import { describe, expect, it } from 'vitest'
import { AVATAR_MAX_BYTES, POST_IMAGE_MAX_BYTES, checkImageFile } from './imageFiles'

// 大きさは中身を作らずに size だけ差し替える（5 MB の配列を作らない）。
function makeFile(name: string, type: string, size = 10): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

const TYPE_MESSAGE = 'JPEG、PNG、GIF、WebP の画像を選んでください'

describe('checkImageFile', () => {
  it('JPEG、PNG、GIF、WebP は通る', () => {
    for (const [name, type] of [
      ['a.jpg', 'image/jpeg'],
      ['a.png', 'image/png'],
      ['a.gif', 'image/gif'],
      ['a.webp', 'image/webp'],
    ]) {
      expect(checkImageFile(makeFile(name, type), POST_IMAGE_MAX_BYTES)).toBeNull()
    }
  })

  describe('形式', () => {
    it('image/svg+xml は形式の文言', () => {
      expect(checkImageFile(makeFile('a.svg', 'image/svg+xml'), POST_IMAGE_MAX_BYTES)).toBe(TYPE_MESSAGE)
    })

    it('MIME が空でも、拡張子が .PNG（大文字）なら通る', () => {
      expect(checkImageFile(makeFile('PHOTO.PNG', ''), POST_IMAGE_MAX_BYTES)).toBeNull()
    })

    it('MIME が image/webp なら、拡張子の無い名前でも通る', () => {
      expect(checkImageFile(makeFile('photo', 'image/webp'), POST_IMAGE_MAX_BYTES)).toBeNull()
    })

    it('MIME も拡張子も合わなければ形式の文言', () => {
      expect(checkImageFile(makeFile('notes.txt', 'text/plain'), POST_IMAGE_MAX_BYTES)).toBe(TYPE_MESSAGE)
      expect(checkImageFile(makeFile('photo', ''), POST_IMAGE_MAX_BYTES)).toBe(TYPE_MESSAGE)
    })
  })

  describe('大きさ', () => {
    it('投稿の上限ちょうどは通り、1 バイト超えると 5 MB の文言', () => {
      expect(checkImageFile(makeFile('a.png', 'image/png', 5_242_880), POST_IMAGE_MAX_BYTES)).toBeNull()
      expect(checkImageFile(makeFile('a.png', 'image/png', 5_242_881), POST_IMAGE_MAX_BYTES)).toBe(
        '画像は 5 MB 以内にしてください',
      )
    })

    it('アイコンの上限なら 2 MB の文言', () => {
      expect(checkImageFile(makeFile('a.png', 'image/png', 2_097_152), AVATAR_MAX_BYTES)).toBeNull()
      expect(checkImageFile(makeFile('a.png', 'image/png', 2_097_153), AVATAR_MAX_BYTES)).toBe(
        '画像は 2 MB 以内にしてください',
      )
    })
  })

  it('形式が先: 6 MB の SVG は形式の文言', () => {
    expect(checkImageFile(makeFile('a.svg', 'image/svg+xml', 6_000_000), POST_IMAGE_MAX_BYTES)).toBe(TYPE_MESSAGE)
  })
})
