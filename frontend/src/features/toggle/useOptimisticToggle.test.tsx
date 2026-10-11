import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../lib/queryClient'
import { TestProviders } from '../../test/providers'
import { useOptimisticToggle, type OptimisticToggleOptions } from './useOptimisticToggle'

type Call = { on: boolean; resolve: () => void; reject: (error: unknown) => void }

// 呼ばれるたびに、手で解決する Promise を 1 つ作って並べる send。
function heldSend(): { send: OptimisticToggleOptions['send']; calls: Call[] } {
  const calls: Call[] = []
  const send = vi.fn(
    (on: boolean) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ on, resolve: () => resolve(), reject })
      }),
  )
  return { send, calls }
}

function makeOptions(overrides: Partial<OptimisticToggleOptions> = {}): OptimisticToggleOptions {
  return {
    scopeId: 'test:1',
    current: false,
    send: () => Promise.resolve(),
    write: () => Promise.resolve(),
    onFailure: () => Promise.resolve(),
    onIdle: () => {},
    ...overrides,
  }
}

function setup(initial: OptimisticToggleOptions) {
  const client: QueryClient = createQueryClient()
  function wrapper({ children }: { children: ReactNode }) {
    return <TestProviders queryClient={client}>{children}</TestProviders>
  }
  return renderHook((options: OptimisticToggleOptions) => useOptimisticToggle(options), { wrapper, initialProps: initial })
}

function press(toggle: () => void) {
  act(() => {
    toggle()
  })
}

async function settle(call: Call | undefined, how: 'resolve' | { reject: unknown } = 'resolve') {
  await act(async () => {
    if (how === 'resolve') call?.resolve()
    else call?.reject(how.reject)
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

describe('useOptimisticToggle', () => {
  it('順番待ちの間に描き直されたら、待っていた要求は新しい send で送る', async () => {
    const first = heldSend()
    const second = heldSend()
    const { result, rerender } = setup(makeOptions({ send: first.send }))

    // 1 回目の要求を送信中にして、続けて 3 回押す。順番待ちの要求が 3 つ並ぶ。
    // useMutation が描き直しで関数を差し替えるのは最後の 1 つだけなので、2 つ目の待ちが古い関数を握っていないことを見る。
    press(result.current)
    await waitFor(() => expect(first.send).toHaveBeenCalledTimes(1))
    press(result.current)
    press(result.current)
    press(result.current)
    expect(first.send).toHaveBeenCalledTimes(1)

    // 待っている間に、親が新しい send を渡して描き直す。
    rerender(makeOptions({ send: second.send }))
    await settle(first.calls[0])

    await waitFor(() => expect(second.send).toHaveBeenCalledTimes(1))
    expect(second.send).toHaveBeenCalledWith(false)
    expect(first.send).toHaveBeenCalledTimes(1)
    await settle(second.calls[0])
  })

  it('順番待ちの要求が失敗したら、描き直したあとの onFailure と write で後始末する', async () => {
    const { send, calls } = heldSend()
    const oldFailure = vi.fn(() => Promise.resolve())
    const newFailure = vi.fn(() => Promise.resolve())
    const oldWrite = vi.fn(() => Promise.resolve())
    const newWrite = vi.fn(() => Promise.resolve())
    const { result, rerender } = setup(makeOptions({ send, onFailure: oldFailure, write: oldWrite }))
    // 1 回目（付ける）を送信中にして、続けて 3 回押す（外す → 付ける → 外す）。順番待ちの要求が 3 つ並ぶ。
    press(result.current)
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    press(result.current)
    press(result.current)
    press(result.current)

    // 待っている間に描き直す。1 回目が成功したあとに送られる 2 つ目の要求（外す）の失敗は、新しい onFailure と write で後始末する。
    // useMutation が描き直しで関数を差し替えるのは最後の待ちだけなので、2 つ目の待ちが古い関数を握っていないことを見る。
    rerender(makeOptions({ send, onFailure: newFailure, write: newWrite }))
    await settle(calls[0])
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    oldWrite.mockClear()
    newWrite.mockClear()
    await settle(calls[1], { reject: new Error('失敗') })

    expect(newFailure).toHaveBeenCalledTimes(1)
    expect(newFailure).toHaveBeenCalledWith(expect.any(Error), false)
    // 保存できた最後の状態（1 回目の「付ける」）に戻す。
    expect(newWrite).toHaveBeenCalledWith(true)
    expect(oldFailure).not.toHaveBeenCalled()
    expect(oldWrite).not.toHaveBeenCalled()
  })
})
