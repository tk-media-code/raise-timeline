// 一覧から項目を消すと、消した項目にあったフォーカスも消えて、キーボードの位置が画面の先頭に戻ってしまう。
// 消す前に、移る先（次の項目、無ければ前の項目の article）を覚えておき、消し終えたあとに返した関数で移す。
// どちらも画面に無いときは、消す前に見えていたページの見出し（main の h1）に移る。
// 一覧は ul > li > article の形（InfiniteList）。item はその article を指す。
//
// 消す通信を待つ間に、利用者は別の画面へ移ったり、別の入力欄で打ち始めたりできる。
// 移すのは、フォーカスが消した項目と一緒に失われたときだけにする。そうでなければ動かさない。
export function prepareFocusAfterRemoval(item: HTMLElement | null): () => void {
  const li = item?.closest('li') ?? null
  const neighbor = li?.nextElementSibling ?? li?.previousElementSibling ?? null
  const target = neighbor?.querySelector('article') ?? null
  // 見出しも消す前に覚える。待つ間に画面が移ると、あとで探した見出しは移った先のものになる。
  const heading = document.querySelector<HTMLElement>('main h1')

  return () => {
    const active = document.activeElement
    const lost = !active || active === document.body || (li?.contains(active) ?? false)
    if (!lost) return
    const next = target?.isConnected ? target : heading?.isConnected ? heading : null
    if (!next) return
    // article も h1 も、そのままではフォーカスできない。プログラムからだけ受け取れるようにする。
    if (!next.hasAttribute('tabindex')) next.tabIndex = -1
    next.focus()
  }
}
