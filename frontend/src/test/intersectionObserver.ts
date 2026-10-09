import { act } from '@testing-library/react'

// jsdom には IntersectionObserver が無い。テストが「見えた」を好きなときに送れる代役を置く。
// 使い終わったら uninstall() で元に戻す（setup.ts が置いた何もしない代役に戻る）。
export type FakeIntersectionObserverControl = {
  // true の間は、observe されたときに「見えた」を非同期で返す。短いページで末尾が見えたままの状態の再現。
  setVisible(visible: boolean): void
  // 監視中のすべてに「見えた」を送る。
  intersect(): void
  // いま監視されている要素の数。
  observedCount(): number
  uninstall(): void
}

export function installFakeIntersectionObserver(): FakeIntersectionObserverControl {
  const original = globalThis.IntersectionObserver
  const live = new Set<FakeObserver>()
  let visible = false

  function entryFor(target: Element, isIntersecting: boolean): IntersectionObserverEntry {
    return {
      target,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
      time: 0,
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRect: target.getBoundingClientRect(),
      rootBounds: null,
    }
  }

  class FakeObserver implements IntersectionObserver {
    readonly root = null
    readonly rootMargin = ''
    readonly scrollMargin = ''
    readonly thresholds: ReadonlyArray<number> = [0]
    readonly targets = new Set<Element>()
    private readonly callback: IntersectionObserverCallback

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      live.add(this)
    }

    observe(target: Element): void {
      this.targets.add(target)
      if (!visible) return
      // 本物と同じく、observe の直後ではなく少し遅れて知らせる。
      // 遅れて届くまでに外されていたら、何も届けない。
      setTimeout(() => {
        if (live.has(this) && this.targets.has(target)) this.deliver([target])
      }, 0)
    }

    unobserve(target: Element): void {
      this.targets.delete(target)
    }

    disconnect(): void {
      this.targets.clear()
      live.delete(this)
    }

    takeRecords(): IntersectionObserverEntry[] {
      return []
    }

    deliver(targets: Element[]): void {
      // 画面の更新は act の中で起こす。テストの外の時刻で起きても警告が出ないようにする。
      act(() => {
        this.callback(
          targets.map((target) => entryFor(target, true)),
          this,
        )
      })
    }
  }

  globalThis.IntersectionObserver = FakeObserver

  return {
    setVisible(value) {
      visible = value
    },
    intersect() {
      for (const observer of [...live]) {
        if (observer.targets.size > 0) observer.deliver([...observer.targets])
      }
    },
    observedCount() {
      let count = 0
      for (const observer of live) count += observer.targets.size
      return count
    },
    uninstall() {
      live.clear()
      globalThis.IntersectionObserver = original
    },
  }
}
