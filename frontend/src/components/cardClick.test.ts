import type { MouseEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { shouldSkipCardNavigation } from './cardClick'

// カードの中を押したときのイベントを作る。target はカードの中の要素、currentTarget はカード。
function clickOn(card: HTMLElement, target: Element): MouseEvent<HTMLElement> {
  return { target, currentTarget: card } as unknown as MouseEvent<HTMLElement>
}

function makeCard(): HTMLElement {
  const card = document.createElement('article')
  card.innerHTML = `
    <a href="/x"><span id="in-link">名前</span></a>
    <button type="button"><span id="in-button">ボタン</span></button>
    <div data-no-detail><span id="in-frame">枠</span></div>
    <p id="body">本文</p>
  `
  return card
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shouldSkipCardNavigation', () => {
  it('カードの中のリンク・ボタン・data-no-detail の内側を押したら true', () => {
    const card = makeCard()

    for (const id of ['in-link', 'in-button', 'in-frame']) {
      expect(shouldSkipCardNavigation(clickOn(card, card.querySelector(`#${id}`)!))).toBe(true)
    }
  })

  it('カードの余白や本文を押したら false', () => {
    const card = makeCard()

    expect(shouldSkipCardNavigation(clickOn(card, card))).toBe(false)
    expect(shouldSkipCardNavigation(clickOn(card, card.querySelector('#body')!))).toBe(false)
  })

  it('カードの外側にあるリンクの中は、カードの余白として扱う', () => {
    const outer = document.createElement('a')
    const card = makeCard()
    outer.append(card)

    expect(shouldSkipCardNavigation(clickOn(card, card.querySelector('#body')!))).toBe(false)
  })

  it('文字を選択中なら true', () => {
    const card = makeCard()
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => '選んだ文字' } as Selection)

    expect(shouldSkipCardNavigation(clickOn(card, card.querySelector('#body')!))).toBe(true)
  })
})
