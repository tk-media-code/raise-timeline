import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { PostImage } from '../../api/posts'
import { ImageGrid } from './ImageGrid'

function makeImages(count: number): PostImage[] {
  return Array.from({ length: count }, (_, i) => ({ id: `i${i + 1}`, url: `/media/i${i + 1}.jpg` }))
}

describe('ImageGrid', () => {
  it.each([1, 2, 3, 4])('押せる並びは %i 枚なら、ボタンが同じ数で「画像 n を拡大」と読まれる', (count) => {
    render(<ImageGrid images={makeImages(count)} interactive />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(count)
    for (let n = 1; n <= count; n++) {
      expect(screen.getByRole('button', { name: `画像 ${n} を拡大` })).toBeInTheDocument()
    }
  })

  it('ボタンの中の画像は装飾（alt が空）で、遅延読み込みにする', () => {
    render(<ImageGrid images={makeImages(2)} interactive />)

    const image = screen.getByRole('button', { name: '画像 1 を拡大' }).querySelector('img')
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('src', '/media/i1.jpg')
    expect(image).toHaveAttribute('loading', 'lazy')
  })

  it('interactive=false ではボタンが無く、画像は「添付画像 n」と読まれる', () => {
    render(<ImageGrid images={makeImages(3)} interactive={false} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: '添付画像 1' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '添付画像 3' })).toBeInTheDocument()
  })

  it('枠は data-no-detail を持つ（カードの移動を起こさない）', () => {
    const { container } = render(<ImageGrid images={makeImages(2)} interactive />)

    expect(container.firstElementChild).toHaveAttribute('data-no-detail')
  })

  it('画像が 0 枚なら何も描かない', () => {
    const { container } = render(<ImageGrid images={[]} interactive />)

    expect(container).toBeEmptyDOMElement()
  })

  it('3 枚目を押すとビューアが開き、画像は「画像 3 / 3」と読まれる', async () => {
    const user = userEvent.setup()
    render(<ImageGrid images={makeImages(3)} interactive />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '画像 3 を拡大' }))

    expect(screen.getByRole('dialog', { name: '画像' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '画像 3 / 3' })).toHaveAttribute('src', '/media/i3.jpg')
  })

  it('ビューアを閉じると、押した画像のボタンへフォーカスが戻る', async () => {
    const user = userEvent.setup()
    render(<ImageGrid images={makeImages(3)} interactive />)

    await user.click(screen.getByRole('button', { name: '画像 2 を拡大' }))
    await user.click(screen.getByRole('button', { name: '閉じる' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '画像 2 を拡大' })).toHaveFocus()
  })

  it('別の画像を開き直すと、その画像から始まる', async () => {
    const user = userEvent.setup()
    render(<ImageGrid images={makeImages(3)} interactive />)

    await user.click(screen.getByRole('button', { name: '画像 3 を拡大' }))
    await user.click(screen.getByRole('button', { name: '閉じる' }))
    await user.click(screen.getByRole('button', { name: '画像 1 を拡大' }))

    expect(screen.getByRole('img', { name: '画像 1 / 3' })).toBeInTheDocument()
  })
})
