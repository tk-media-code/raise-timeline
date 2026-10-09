import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PostImage } from '../../api/posts'
import { ImageViewer } from './ImageViewer'

function makeImages(count: number): PostImage[] {
  return Array.from({ length: count }, (_, i) => ({ id: `i${i + 1}`, url: `/media/i${i + 1}.jpg` }))
}

function renderViewer(count: number, startIndex = 0) {
  const onClose = vi.fn()
  render(<ImageViewer images={makeImages(count)} startIndex={startIndex} open onClose={onClose} />)
  return { onClose }
}

describe('ImageViewer', () => {
  it('開いていないときは、中身を描かない', () => {
    render(<ImageViewer images={makeImages(3)} startIndex={0} open={false} onClose={() => {}} />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('startIndex の画像から始まり、フォーカスは「閉じる」にある', () => {
    renderViewer(3, 1)

    expect(screen.getByRole('dialog', { name: '画像' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '画像 2 / 3' })).toHaveAttribute('src', '/media/i2.jpg')
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveFocus()
  })

  it('「次の画像」で 2 / 3 → 3 / 3 → 1 / 3 と回る', async () => {
    const user = userEvent.setup()
    renderViewer(3)
    await user.click(screen.getByRole('button', { name: '次の画像' }))
    expect(screen.getByRole('img', { name: '画像 2 / 3' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '次の画像' }))
    expect(screen.getByRole('img', { name: '画像 3 / 3' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '次の画像' }))
    expect(screen.getByRole('img', { name: '画像 1 / 3' })).toBeInTheDocument()
  })

  it('「前の画像」は逆に回る（1 / 3 の前は 3 / 3）', async () => {
    const user = userEvent.setup()
    renderViewer(3)

    await user.click(screen.getByRole('button', { name: '前の画像' }))
    expect(screen.getByRole('img', { name: '画像 3 / 3' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '前の画像' }))
    expect(screen.getByRole('img', { name: '画像 2 / 3' })).toBeInTheDocument()
  })

  it('ArrowRight と ArrowLeft でも同じように回る', async () => {
    const user = userEvent.setup()
    renderViewer(3)

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('img', { name: '画像 2 / 3' })).toBeInTheDocument()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('img', { name: '画像 1 / 3' })).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('img', { name: '画像 3 / 3' })).toBeInTheDocument()
  })

  it('1 枚なら前後のボタンが無く、名前は「画像」で、矢印キーでは動かない', async () => {
    const user = userEvent.setup()
    renderViewer(1)

    expect(screen.queryByRole('button', { name: '前の画像' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '次の画像' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('img', { name: '画像' })).toHaveAttribute('src', '/media/i1.jpg')
  })

  it('「閉じる」で onClose を呼ぶ', async () => {
    const user = userEvent.setup()
    const { onClose } = renderViewer(2)

    await user.click(screen.getByRole('button', { name: '閉じる' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('背景（画像とボタン以外）を押すと onClose を呼ぶ', async () => {
    const user = userEvent.setup()
    const { onClose } = renderViewer(2)
    const stage = screen.getByRole('img', { name: '画像 1 / 2' }).parentElement as HTMLElement

    await user.click(stage)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc（cancel）で onClose を呼び、ブラウザの既定の閉じ方は止める', () => {
    const { onClose } = renderViewer(2)
    const cancel = new Event('cancel', { cancelable: true })

    fireEvent(screen.getByRole('dialog'), cancel)

    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('画像そのものを押しても閉じない', async () => {
    const user = userEvent.setup()
    const { onClose } = renderViewer(2)

    await user.click(screen.getByRole('img', { name: '画像 1 / 2' }))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('「前の画像」「次の画像」を押しても閉じない', async () => {
    const user = userEvent.setup()
    const { onClose } = renderViewer(3)

    await user.click(screen.getByRole('button', { name: '次の画像' }))
    await user.click(screen.getByRole('button', { name: '前の画像' }))

    expect(onClose).not.toHaveBeenCalled()
  })
})
