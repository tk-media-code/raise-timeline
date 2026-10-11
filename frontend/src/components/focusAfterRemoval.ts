// 一覧から項目を消すと、消した項目にあったフォーカスも消えて、キーボードの位置が画面の先頭に戻ってしまう。
// 消す前に、移る先（次の項目、無ければ前の項目の article）を覚えておき、消し終えたあとに返した関数で移す。
// どちらも画面に無いときは、そのページの見出し（main の h1）に移る。
// 一覧は ul > li > article の形（InfiniteList）。item はその article を指す。
export function prepareFocusAfterRemoval(item: HTMLElement | null): () => void {
  const li = item?.closest('li') ?? null
  const neighbor = li?.nextElementSibling ?? li?.previousElementSibling ?? null
  const target = neighbor?.querySelector('article') ?? null

  return () => {
    const next = target?.isConnected ? target : document.querySelector<HTMLElement>('main h1')
    if (!next) return
    // article も h1 も、そのままではフォーカスできない。プログラムからだけ受け取れるようにする。
    if (!next.hasAttribute('tabindex')) next.tabIndex = -1
    next.focus()
  }
}
