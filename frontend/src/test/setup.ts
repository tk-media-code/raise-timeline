// 各テストファイルの実行前に読み込まれる（vite.config.ts の test.setupFiles）。
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// globals: false にしていると Testing Library の自動 cleanup が働かないので、明示的に呼ぶ。
// 忘れると、前のテストで描画した DOM が次のテストに残る。
afterEach(() => {
  cleanup()
})

// jsdom は <dialog> の showModal() / close() を実装していない（呼ぶと TypeError）。
// open 属性の付け外しで代用し、ConfirmDialog の開閉をテストできるようにする。
// 将来 jsdom が実装したときは、そちらを優先する。
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  // 本物は閉じたあとに close イベントを出す（開いていないときは出さない）。ModalDialog がこれを受けて親の状態を合わせる。
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

// jsdom には IntersectionObserver が無い。無限スクロールの部品が使うので、何もしない代役を置く
// （監視しても何も知らせない。表示が崩れず、無関係なテストが落ちないための最小限）。
// 「見えた」を送りたいテストは test/intersectionObserver.ts の installFakeIntersectionObserver を使う。
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class NoopIntersectionObserver implements IntersectionObserver {
    readonly root = null
    readonly rootMargin = ''
    readonly scrollMargin = ''
    readonly thresholds: ReadonlyArray<number> = []
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
}
