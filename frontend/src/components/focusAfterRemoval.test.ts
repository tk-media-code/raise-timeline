import { afterEach, describe, expect, it } from 'vitest'
import { prepareFocusAfterRemoval } from './focusAfterRemoval'

// 一覧と同じ形（ul > li > article）を DOM で直接組む。
function buildList(count: number) {
  document.body.innerHTML = `
    <main>
      <h1>タイムライン</h1>
      <ul>${Array.from({ length: count }, (_, index) => `<li><article>項目${index}</article></li>`).join('')}</ul>
    </main>`
  const items = Array.from(document.querySelectorAll('li'))
  const articles = Array.from(document.querySelectorAll('article'))
  return { items, articles, heading: document.querySelector('h1') }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('prepareFocusAfterRemoval', () => {
  it('真ん中の項目を消すと、次の項目の article にフォーカスが移る', () => {
    const { items, articles } = buildList(3)
    const restore = prepareFocusAfterRemoval(articles[1] ?? null)

    items[1]?.remove()
    restore()

    expect(document.activeElement).toBe(articles[2])
  })

  it('最後の項目を消すと、前の項目の article にフォーカスが移る', () => {
    const { items, articles } = buildList(3)
    const restore = prepareFocusAfterRemoval(articles[2] ?? null)

    items[2]?.remove()
    restore()

    expect(document.activeElement).toBe(articles[1])
  })

  it('1 件だけの項目を消すと、main の h1 に tabindex=-1 を付けてフォーカスが移る', () => {
    const { items, articles, heading } = buildList(1)
    expect(heading).not.toHaveAttribute('tabindex')
    const restore = prepareFocusAfterRemoval(articles[0] ?? null)

    items[0]?.remove()
    restore()

    expect(document.activeElement).toBe(heading)
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('覚えた項目がもう画面に無ければ、main の h1 に移る', () => {
    const { items, articles, heading } = buildList(2)
    const restore = prepareFocusAfterRemoval(articles[0] ?? null)

    items[0]?.remove()
    items[1]?.remove()
    restore()

    expect(document.activeElement).toBe(heading)
  })

  it('消す項目が分からない（null）ときも、h1 に移る', () => {
    const { heading } = buildList(2)
    const restore = prepareFocusAfterRemoval(null)

    restore()

    expect(document.activeElement).toBe(heading)
  })

  it('移る先が無ければ（h1 も無ければ）何も起こらない', () => {
    document.body.innerHTML = '<ul><li><article>だけ</article></li></ul>'
    const restore = prepareFocusAfterRemoval(document.querySelector('article'))
    document.querySelector('li')?.remove()

    expect(() => restore()).not.toThrow()
    expect(document.activeElement).toBe(document.body)
  })

  it('消した項目の中にあったフォーカスは、消えたあとも「失われた」として次の項目に移す', () => {
    const { items, articles } = buildList(3)
    const button = document.createElement('button')
    articles[1]?.append(button)
    button.focus()
    const restore = prepareFocusAfterRemoval(articles[1] ?? null)

    // 消す前に、フォーカスが消す項目の中にある。項目を外すと、フォーカスは body に落ちる。
    items[1]?.remove()
    restore()

    expect(document.activeElement).toBe(articles[2])
  })

  it('項目がまだ画面にあるうちに呼んでも、フォーカスが消す項目の中にあれば、次の項目に移す', () => {
    const { items, articles } = buildList(3)
    const button = document.createElement('button')
    articles[1]?.append(button)
    button.focus()
    const restore = prepareFocusAfterRemoval(articles[1] ?? null)

    // 消す項目がまだ DOM にあり、フォーカスはその中にある。
    expect(document.activeElement).toBe(button)
    restore()

    expect(document.activeElement).toBe(articles[2])
    items[1]?.remove()
  })

  it('項目がまだ画面にあるうちに呼んだとき、フォーカスが消す項目の外にあれば動かさない', () => {
    const { articles } = buildList(3)
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    const restore = prepareFocusAfterRemoval(articles[1] ?? null)

    restore()

    expect(document.activeElement).toBe(input)
  })

  it('待っている間に別の画面へ移っていたら（見出しが別物なら）、フォーカスを動かさない', () => {
    const { items, articles } = buildList(1)
    const restore = prepareFocusAfterRemoval(articles[0] ?? null)

    items[0]?.remove()
    document.querySelector('main')!.innerHTML = '<h1>検索</h1>'
    restore()

    expect(document.activeElement).toBe(document.body)
    expect(document.querySelector('h1')).not.toHaveAttribute('tabindex')
  })

  it('待っている間に別の入力欄へ移っていたら、フォーカスを動かさない', () => {
    const { items, articles } = buildList(3)
    const input = document.createElement('input')
    document.body.append(input)
    const restore = prepareFocusAfterRemoval(articles[1] ?? null)

    input.focus()
    items[1]?.remove()
    restore()

    expect(document.activeElement).toBe(input)
  })
})
