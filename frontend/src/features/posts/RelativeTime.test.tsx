import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RelativeTime } from './RelativeTime'

describe('RelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T05:10:30Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('now を渡さなければ、今の時刻からの相対時刻を出し、1 分ごとに進める', () => {
    render(<RelativeTime createdAt="2026-10-06T05:09:00Z" />)
    expect(screen.getByText('1 分前')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(screen.getByText('2 分前')).toBeInTheDocument()
  })

  it('now を渡したときは、その時刻からの相対時刻を出し、時間がたっても進まない', () => {
    render(<RelativeTime createdAt="2026-10-06T05:09:00Z" now={new Date('2026-10-06T05:12:00Z')} />)

    act(() => {
      vi.advanceTimersByTime(5 * 60_000)
    })

    expect(screen.getByText('3 分前')).toBeInTheDocument()
  })

  it('外れるとタイマーが止まる', () => {
    const view = render(<RelativeTime createdAt="2026-10-06T05:09:00Z" />)
    expect(vi.getTimerCount()).toBe(1)

    view.unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
