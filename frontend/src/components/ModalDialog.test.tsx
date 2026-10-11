import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ModalDialog } from './ModalDialog'

type HarnessProps = { onCancel?: () => void; onBrowserClose?: () => void }

// 開閉の正を親の状態に持つ、実際の使われ方に近い形。開くボタンにフォーカスがある状態から始める。
function Harness({ onCancel = () => {}, onBrowserClose }: HarnessProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        開く
      </button>
      <ModalDialog
        open={open}
        label="テスト用"
        onCancel={() => {
          onCancel()
          setOpen(false)
        }}
        onBrowserClose={onBrowserClose}
      >
        <button type="button" onClick={() => setOpen(false)}>
          閉じる
        </button>
        <input aria-label="入力欄" data-autofocus />
      </ModalDialog>
    </>
  )
}

function renderPlain(open: boolean, props: { onBrowserClose?: () => void; className?: string } = {}) {
  const onCancel = vi.fn()
  const view = render(
    <ModalDialog open={open} label="テスト用" onCancel={onCancel} {...props}>
      <p>中身</p>
    </ModalDialog>,
  )
  return { ...view, onCancel, dialog: () => view.container.querySelector('dialog')! }
}

describe('ModalDialog', () => {
  it('open が true なら dialog に open 属性が付き、中身が出る。false なら開かず、中身も描かない', () => {
    const opened = renderPlain(true)
    expect(opened.dialog()).toHaveAttribute('open')
    expect(screen.getByRole('dialog', { name: 'テスト用' })).toHaveTextContent('中身')
    opened.unmount()

    const closed = renderPlain(false)
    expect(closed.dialog()).not.toHaveAttribute('open')
    expect(closed.dialog()).toBeEmptyDOMElement()
  })

  it('open が true から false に変わると閉じ、中身も消える', () => {
    const { rerender, dialog, onCancel } = renderPlain(true)

    rerender(
      <ModalDialog open={false} label="テスト用" onCancel={onCancel}>
        <p>中身</p>
      </ModalDialog>,
    )

    expect(dialog()).not.toHaveAttribute('open')
    expect(screen.queryByText('中身')).not.toBeInTheDocument()
  })

  it('名前は labelledBy（見出しの id）か label（直接の文字）で付く', () => {
    const labelled = render(
      <ModalDialog open labelledBy="heading" onCancel={() => {}}>
        <h2 id="heading">見出しの名前</h2>
      </ModalDialog>,
    )
    expect(screen.getByRole('dialog', { name: '見出しの名前' })).toBeInTheDocument()
    labelled.unmount()

    render(
      <ModalDialog open label="直接の名前" onCancel={() => {}}>
        <p>中身</p>
      </ModalDialog>,
    )
    expect(screen.getByRole('dialog', { name: '直接の名前' })).toBeInTheDocument()
  })

  it('className を渡すと、既定の枠のクラスの代わりに使う', () => {
    const { dialog } = renderPlain(true, { className: 'custom-frame' })

    expect(dialog()).toHaveClass('custom-frame')
    expect(dialog()).not.toHaveClass('rounded-lg')
  })

  it('Esc（cancel イベント）で onCancel を呼び、ブラウザ側では閉じない', () => {
    const { dialog, onCancel } = renderPlain(true)

    const notPrevented = fireEvent(dialog(), new Event('cancel', { cancelable: true }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    // 閉じる・閉じないは open の props が決める。
    expect(notPrevented).toBe(false)
    expect(dialog()).toHaveAttribute('open')
  })

  it('背景（dialog 自身）の押下では閉じず、onCancel も呼ばない', async () => {
    const { dialog, onCancel } = renderPlain(true)

    await userEvent.click(dialog())

    expect(onCancel).not.toHaveBeenCalled()
    expect(dialog()).toHaveAttribute('open')
  })

  it('ブラウザが閉じたのに親がまだ開いているとき、onBrowserClose を呼ぶ。渡さなければ onCancel を呼ぶ', () => {
    const onBrowserClose = vi.fn()
    const withHandler = renderPlain(true, { onBrowserClose })
    fireEvent(withHandler.dialog(), new Event('close'))
    expect(onBrowserClose).toHaveBeenCalledTimes(1)
    expect(withHandler.onCancel).not.toHaveBeenCalled()
    withHandler.unmount()

    const without = renderPlain(true)
    fireEvent(without.dialog(), new Event('close'))
    expect(without.onCancel).toHaveBeenCalledTimes(1)
  })

  it('親の指示で閉じたときは、close イベントが来ても onCancel も onBrowserClose も呼ばない', () => {
    const onBrowserClose = vi.fn()
    const { rerender, dialog, onCancel } = renderPlain(true, { onBrowserClose })

    rerender(
      <ModalDialog open={false} label="テスト用" onCancel={onCancel} onBrowserClose={onBrowserClose}>
        <p>中身</p>
      </ModalDialog>,
    )

    // 親が閉じると close() が呼ばれ、setup の代役が close イベントを出す。
    expect(onCancel).not.toHaveBeenCalled()
    expect(onBrowserClose).not.toHaveBeenCalled()
    expect(dialog()).not.toHaveAttribute('open')
  })

  it('開くと data-autofocus の要素にフォーカスが移り、閉じると開く前にいた要素へ戻る', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: '開く' })
    trigger.focus()

    await userEvent.keyboard('{Enter}')

    expect(screen.getByRole('textbox', { name: '入力欄' })).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))

    expect(trigger).toHaveFocus()
  })

  it('Esc で閉じたときも、開く前にいた要素へフォーカスが戻る', async () => {
    const onCancel = vi.fn()
    const { container } = render(<Harness onCancel={onCancel} />)
    const trigger = screen.getByRole('button', { name: '開く' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')

    fireEvent(container.querySelector('dialog')!, new Event('cancel', { cancelable: true }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(container.querySelector('dialog')).not.toHaveAttribute('open')
    expect(trigger).toHaveFocus()
  })
})
