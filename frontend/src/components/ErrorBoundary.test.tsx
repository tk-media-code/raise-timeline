import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React は捕まえた例外を console.error に出す。このテストでは想定した出力なので黙らせる。
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('例外が無ければ子をそのまま描く', () => {
    render(
      <ErrorBoundary>
        <p>中身</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('中身')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '再読み込み' })).not.toBeInTheDocument()
  })

  it('描画中の例外で、メッセージと再読み込みボタンの画面が出る', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { level: 1, name: '問題が起きました。再読み込みしてください' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument()
  })

  it('再読み込みボタンで window.location.reload を呼ぶ', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
