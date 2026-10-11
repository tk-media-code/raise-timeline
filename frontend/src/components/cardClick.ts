import type { MouseEvent } from 'react'

// カード全体を押して移るとき、移らずに本来の操作を優先する場合か。
// カードの中のリンク、ボタン、メニューの枠（data-no-detail）の上と、文字の選択の最中は true。
// 移る先は呼び出し側が決める。
export function shouldSkipCardNavigation(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target
  if (target instanceof Element) {
    const interactive = target.closest('a, button, [data-no-detail]')
    if (interactive && event.currentTarget.contains(interactive)) return true
  }
  return Boolean(window.getSelection()?.toString())
}
