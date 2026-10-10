import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

function renderDialog(open: boolean, handlers = { onConfirm: vi.fn(), onCancel: vi.fn() }) {
  const view = render(
    <ConfirmDialog
      open={open}
      title="ログアウトしますか？"
      description="この端末のログイン状態を破棄します。"
      confirmLabel="ログアウト"
      {...handlers}
    />,
  )
  return { ...view, ...handlers }
}

describe('ConfirmDialog', () => {
  it('open が true なら dialog に open 属性が付き、題と説明が出る', () => {
    renderDialog(true)

    const dialog = screen.getByRole('dialog', { name: 'ログアウトしますか？' })
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveTextContent('この端末のログイン状態を破棄します。')
  })

  it('open が false なら開かない', () => {
    const { container } = renderDialog(false)

    expect(container.querySelector('dialog')).not.toHaveAttribute('open')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('open が true から false に変わると閉じる', () => {
    const { container, rerender } = renderDialog(true)

    rerender(
      <ConfirmDialog
        open={false}
        title="ログアウトしますか？"
        description="説明"
        confirmLabel="ログアウト"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(container.querySelector('dialog')).not.toHaveAttribute('open')
  })

  it('確認ボタンで onConfirm、取り消しで onCancel を呼ぶ', async () => {
    const { onConfirm, onCancel } = renderDialog(true)

    await userEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '取り消し' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('取り消しが既定のフォーカスを持つ', () => {
    renderDialog(true)

    expect(screen.getByRole('button', { name: '取り消し' })).toHaveFocus()
  })

  it('Esc（cancel イベント）で onCancel を呼び、ブラウザ側では閉じない', () => {
    const { container, onCancel } = renderDialog(true)
    const dialog = container.querySelector('dialog')!

    const notPrevented = fireEvent(dialog, new Event('cancel', { cancelable: true }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    // 閉じる・閉じないは open の props が決める。
    expect(notPrevented).toBe(false)
    expect(dialog).toHaveAttribute('open')
  })

  it('description があれば説明の段落を出し、aria-describedby でつなぐ', () => {
    renderDialog(true)

    expect(screen.getByRole('dialog', { name: 'ログアウトしますか？' })).toHaveAccessibleDescription(
      'この端末のログイン状態を破棄します。',
    )
  })

  it('description を省くと説明の段落と aria-describedby を出さない', () => {
    const { container } = render(
      <ConfirmDialog open title="コメントを削除しますか？" confirmLabel="削除" onConfirm={() => {}} onCancel={() => {}} />,
    )

    const dialog = container.querySelector('dialog')!
    expect(dialog).not.toHaveAttribute('aria-describedby')
    expect(dialog.querySelector('p')).toBeNull()
  })
})
