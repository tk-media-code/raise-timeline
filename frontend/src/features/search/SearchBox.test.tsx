import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEARCH_DEBOUNCE_MS, SearchBox } from './SearchBox'

// 時計は偽物にして、検索の待ちを進めるのはテストの側。user-event と Testing Library の内部の待ち（setTimeout）が
// 進まないと止まってしまうので、実時間でも少しずつ進める（shouldAdvanceTime）。
// 実時間で進む分があるので、399 と 400 の境目を確かめるテストは、await を挟まず同期の fireEvent だけで打つ。
function setup(props: Partial<Parameters<typeof SearchBox>[0]> = {}) {
  const onSearch = vi.fn()
  const result = render(<SearchBox defaultValue="" error={null} onSearch={onSearch} {...props} />)
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const input = screen.getByRole('searchbox', { name: 'ユーザー名か表示名' })
  return { onSearch, user, input, ...result }
}

// 同期で 1 回入力を変える。打った直後から時計を数え始める。
function typeSync(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } })
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('SearchBox', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('待つ時間は 400 ミリ秒', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(400)
  })

  it('入力が止まって 400 ミリ秒後に、欄の文字で onSearch が 1 回呼ばれる。399 ミリ秒では呼ばれない', () => {
    const { onSearch, input } = setup()

    typeSync(input, 'ali')
    advance(399)
    expect(onSearch).not.toHaveBeenCalled()
    advance(1)

    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('ali')
  })

  it('続けて打つと、最後の入力から 400 ミリ秒後に 1 回だけ呼ばれる', () => {
    const { onSearch, input } = setup()

    typeSync(input, 'a')
    advance(300)
    typeSync(input, 'al')
    advance(300)
    typeSync(input, 'ali')
    advance(399)
    expect(onSearch).not.toHaveBeenCalled()
    advance(1)
    advance(1000)

    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('ali')
  })

  it('空白はそのまま渡す（除くのは呼ぶ側）', async () => {
    const { onSearch, user, input } = setup()

    await user.type(input, ' ali ')
    advance(400)

    expect(onSearch).toHaveBeenCalledWith(' ali ')
  })

  it('Enter ですぐ呼ばれ、そのあと 400 ミリ秒待っても、もう呼ばれない', async () => {
    const { onSearch, user, input } = setup()

    act(() => input.focus())
    typeSync(input, 'ali')
    await user.keyboard('{Enter}')
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('ali')
    advance(1000)

    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('変換中は呼ばれず、compositionend から 400 ミリ秒後に確定した文字で 1 回呼ばれる', () => {
    const { onSearch, input } = setup()

    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'あ' } })
    fireEvent.change(input, { target: { value: 'あり' } })
    fireEvent.change(input, { target: { value: 'ありす' } })
    advance(1000)
    expect(onSearch).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'アリス' } })
    fireEvent.compositionEnd(input)
    advance(399)
    expect(onSearch).not.toHaveBeenCalled()
    advance(1)

    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('アリス')
  })

  it('変換中に 400 ミリ秒以上たっても呼ばれない', () => {
    const { onSearch, input } = setup()

    // 変換の前に打った分の待ちも、変換が始まったら捨てられる。
    fireEvent.change(input, { target: { value: 'a' } })
    advance(200)
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'aあ' } })
    advance(5000)

    expect(onSearch).not.toHaveBeenCalled()
  })

  it('compositionend の直後に Enter を押すと、すぐ 1 回呼ばれ、400 ミリ秒後にもう呼ばれない', async () => {
    const { onSearch, user, input } = setup()

    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'アリス' } })
    fireEvent.compositionEnd(input)
    act(() => input.focus())
    await user.keyboard('{Enter}')
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('アリス')
    advance(1000)

    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('空にすると、400 ミリ秒後に空文字で呼ばれる', () => {
    const { onSearch, input } = setup({ defaultValue: 'ali' })

    typeSync(input, '')
    advance(399)
    expect(onSearch).not.toHaveBeenCalled()
    advance(1)

    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('')
  })

  it('外されたら、待っていた分は呼ばれない', async () => {
    const { onSearch, user, input, unmount } = setup()

    await user.type(input, 'ali')
    unmount()
    advance(1000)

    expect(onSearch).not.toHaveBeenCalled()
  })

  it('defaultValue が欄の最初の文字になる。再描画で欄の文字を上書きしない', async () => {
    const onSearch = vi.fn()
    const { rerender } = render(<SearchBox defaultValue="ali" error={null} onSearch={onSearch} />)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const input = screen.getByRole('searchbox')
    expect(input).toHaveValue('ali')

    await user.type(input, ' ')
    rerender(<SearchBox defaultValue="ali" error={null} onSearch={onSearch} />)

    expect(input).toHaveValue('ali ')
  })

  it('error があれば role=alert で出し、欄が aria-invalid になって説明に結ばれる', () => {
    setup({ error: '50 文字以内で入力してください' })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('50 文字以内で入力してください')
    const input = screen.getByRole('searchbox', { name: 'ユーザー名か表示名' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('50 文字以内で入力してください')
  })

  it('error が無ければ alert は無く、aria-invalid も付かない', () => {
    const { input } = setup()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('欄の名前は「ユーザー名か表示名」、見える文字は「ユーザー名か表示名で探す」、type は search', () => {
    const { input } = setup()

    expect(input).toHaveAttribute('type', 'search')
    expect(input).toHaveAttribute('placeholder', 'ユーザー名か表示名で探す')
    expect(screen.getByRole('search')).toBeInTheDocument()
    expect(input).toHaveClass('min-h-11')
  })
})
