// 各テストファイルの実行前に読み込まれる（vite.config.ts の test.setupFiles）。
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// globals: false にしていると Testing Library の自動 cleanup が働かないので、明示的に呼ぶ。
// 忘れると、前のテストで描画した DOM が次のテストに残る。
afterEach(() => {
  cleanup()
})
