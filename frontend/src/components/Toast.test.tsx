import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from './Toast'

function Trigger({ messages }: { messages: Array<[string, ('success' | 'error')?]> }) {
  const { show } = useToast()
  return (
    <button type="button" onClick={() => messages.forEach(([message, kind]) => show(message, kind))}>
      出す
    </button>
  )
}

function renderToasts(messages: Array<[string, ('success' | 'error')?]>) {
  render(
    <ToastProvider>
      <Trigger messages={messages} />
    </ToastProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: '出す' }))
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('成功の通知は role="status" で出て、4000 ms で消える', () => {
    renderToasts([['投稿しました']])

    expect(screen.getByRole('status')).toHaveTextContent('投稿しました')

    advance(3999)
    expect(screen.getByRole('status')).toBeInTheDocument()

    advance(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('kind を省くと成功として出る', () => {
    renderToasts([['投稿しました']])

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('失敗の通知は role="alert" で出て、10 秒経っても残り、「閉じる」で消える', () => {
    renderToasts([['サーバーで問題が起きました（ID: abc）', 'error']])

    expect(screen.getByRole('alert')).toHaveTextContent('サーバーで問題が起きました（ID: abc）')

    advance(10_000)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('2 つの通知は両方とも出る。新しいものが下にある', () => {
    renderToasts([['1 つ目'], ['2 つ目', 'error']])

    const first = screen.getByText('1 つ目')
    const second = screen.getByText('2 つ目')
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('成功の通知の消える時刻は、それぞれの出た時刻から数える', () => {
    render(
      <ToastProvider>
        <Trigger messages={[['1 つ目']]} />
        <Trigger messages={[['2 つ目']]} />
      </ToastProvider>,
    )
    const [first, second] = screen.getAllByRole('button', { name: '出す' })
    fireEvent.click(first)
    advance(3000)
    fireEvent.click(second)

    advance(1000)
    expect(screen.queryByText('1 つ目')).not.toBeInTheDocument()
    expect(screen.getByText('2 つ目')).toBeInTheDocument()

    advance(3000)
    expect(screen.queryByText('2 つ目')).not.toBeInTheDocument()
  })

  it('Provider の外で useToast を使うと例外になる', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger messages={[]} />)).toThrow('ToastProvider')
    spy.mockRestore()
  })
})
