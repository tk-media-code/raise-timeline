import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNow } from './useNow'

function Clock({ name }: { name: string }) {
  return <p>{`${name}: ${useNow().toISOString()}`}</p>
}

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-11T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('60 秒たつと、新しい時刻で描き直す', () => {
    render(<Clock name="a" />)
    expect(screen.getByText('a: 2026-10-11T00:00:00.000Z')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(59_000)
    })
    expect(screen.getByText('a: 2026-10-11T00:00:00.000Z')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(screen.getByText('a: 2026-10-11T00:01:00.000Z')).toBeInTheDocument()
  })

  it('部品が 3 つあっても、タイマーは 1 本で、3 つとも同じ時刻になる', () => {
    render(
      <>
        <Clock name="a" />
        <Clock name="b" />
        <Clock name="c" />
      </>,
    )
    expect(vi.getTimerCount()).toBe(1)

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    for (const name of ['a', 'b', 'c']) {
      expect(screen.getByText(`${name}: 2026-10-11T00:01:00.000Z`)).toBeInTheDocument()
    }
  })

  it('全部の部品が外れたら、タイマーは 0 になる。使い始めると、また 1 本動く', () => {
    const first = render(
      <>
        <Clock name="a" />
        <Clock name="b" />
      </>,
    )
    expect(vi.getTimerCount()).toBe(1)

    first.unmount()
    expect(vi.getTimerCount()).toBe(0)

    const second = render(<Clock name="a" />)
    expect(vi.getTimerCount()).toBe(1)
    second.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('部品が残っている間は、1 つ外れてもタイマーは止まらない', () => {
    const a = render(<Clock name="a" />)
    render(<Clock name="b" />)

    a.unmount()

    expect(vi.getTimerCount()).toBe(1)
  })

  it('使う部品が無かった間に時間がたっていても、次に使うときは今の時刻から始まる', () => {
    const first = render(<Clock name="a" />)
    first.unmount()

    vi.setSystemTime(new Date('2026-10-11T03:00:00Z'))
    render(<Clock name="a" />)

    expect(screen.getByText('a: 2026-10-11T03:00:00.000Z')).toBeInTheDocument()
  })
})
