import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 購読者の一覧とチャンネルはモジュール変数なので、テストごとに読み直して持ち越さない。
async function load() {
  return await import('./authChannel')
}

// Vitest の jsdom 環境では、jsdom 自身は BroadcastChannel を持たないが、Node のものが残っていて、
// 同じプロセスの中のインスタンス同士に届ける。これを「別のタブ」として使う。
describe('authChannel', () => {
  let otherTab: BroadcastChannel
  let received: unknown[]

  beforeEach(async () => {
    vi.resetModules()
    const { AUTH_CHANNEL_NAME } = await load()
    received = []
    otherTab = new BroadcastChannel(AUTH_CHANNEL_NAME)
    otherTab.onmessage = (event: MessageEvent) => received.push(event.data)
  })

  afterEach(() => {
    otherTab.close()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('announceAuthChanged は他のタブに { type: \'auth-changed\' } を 1 回届ける', async () => {
    const { announceAuthChanged } = await load()

    announceAuthChanged()

    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(received[0]).toEqual({ type: 'auth-changed' })
  })

  it('他のタブの auth-changed で購読者が呼ばれる', async () => {
    const { onAuthChangedElsewhere } = await load()
    const listener = vi.fn()
    const unsubscribe = onAuthChangedElsewhere(listener)
    const sender = new BroadcastChannel('raise-timeline-auth')

    sender.postMessage({ type: 'auth-changed' })

    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    sender.close()
    unsubscribe()
  })

  it('自分が送った知らせでは、自分の購読者は呼ばれない', async () => {
    const { announceAuthChanged, onAuthChangedElsewhere } = await load()
    const listener = vi.fn()
    const unsubscribe = onAuthChangedElsewhere(listener)

    announceAuthChanged()

    // 他のタブに届いた時点で、同じチャンネルの配送は済んでいる。
    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('auth-changed 以外の知らせは無視する', async () => {
    const { onAuthChangedElsewhere } = await load()
    const listener = vi.fn()
    const unsubscribe = onAuthChangedElsewhere(listener)
    const sender = new BroadcastChannel('raise-timeline-auth')

    sender.postMessage({ type: 'other' })
    sender.postMessage('x')
    // 無視されたことを、後続の正しい知らせが届いた時点で確かめる（順序は保たれる）。
    sender.postMessage({ type: 'auth-changed' })

    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    sender.close()
    unsubscribe()
  })

  it('購読をすべて外すとチャンネルを閉じる', async () => {
    const { onAuthChangedElsewhere } = await load()
    const close = vi.spyOn(BroadcastChannel.prototype, 'close')
    const unsubscribeA = onAuthChangedElsewhere(vi.fn())
    const unsubscribeB = onAuthChangedElsewhere(vi.fn())

    unsubscribeA()
    expect(close).not.toHaveBeenCalled()
    unsubscribeB()

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('購読を外したあとの送信は、一時的なチャンネルで送って閉じる', async () => {
    const { announceAuthChanged, onAuthChangedElsewhere } = await load()
    onAuthChangedElsewhere(vi.fn())()
    const close = vi.spyOn(BroadcastChannel.prototype, 'close')

    announceAuthChanged()

    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('BroadcastChannel が無い環境でも例外を投げない', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const { announceAuthChanged, onAuthChangedElsewhere } = await load()

    expect(() => announceAuthChanged()).not.toThrow()
    const unsubscribe = onAuthChangedElsewhere(vi.fn())
    expect(() => unsubscribe()).not.toThrow()
  })
})
