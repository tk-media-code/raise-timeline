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

  it('成功の通知は、通知を出す前からある role="status"（名前「通知」）の中に出て、4000 ms で消える', () => {
    render(
      <ToastProvider>
        <Trigger messages={[['投稿しました']]} />
      </ToastProvider>,
    )
    // 読み上げソフトは、領域ごと後から差し込まれた status を読まないことがある。出す前に取った参照で確かめる。
    const region = screen.getByRole('status', { name: '通知' })
    expect(region).toBeEmptyDOMElement()

    fireEvent.click(screen.getByRole('button', { name: '出す' }))
    expect(screen.getByRole('status', { name: '通知' })).toBe(region)
    expect(region).toHaveTextContent('投稿しました')

    advance(3999)
    expect(region).toHaveTextContent('投稿しました')

    advance(1)
    expect(region).not.toHaveTextContent('投稿しました')
  })

  it('成功の通知が消えた後も、領域は残る', () => {
    renderToasts([['投稿しました']])
    const region = screen.getByRole('status', { name: '通知' })

    advance(4000)

    expect(region).toBeInTheDocument()
    expect(region).toBeEmptyDOMElement()
  })

  it('失敗の通知は領域に入れず、それぞれ role="alert" で出る', () => {
    renderToasts([['成功です'], ['失敗です', 'error']])

    expect(screen.getByRole('status', { name: '通知' })).toHaveTextContent('成功です')
    expect(screen.getByRole('alert')).toHaveTextContent('失敗です')
    expect(screen.getByRole('status', { name: '通知' })).not.toHaveTextContent('失敗です')
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
