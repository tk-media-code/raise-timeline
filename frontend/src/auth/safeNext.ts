// ログイン後の戻り先（?next=）を、同じサイト内のパスだけに絞る。
// 絞らないと、攻撃者が作ったリンクでログインさせた先を外部サイトにできる（オープンリダイレクト）。
// 制御文字を弾くのは、ブラウザが URL からタブと改行を取り除くため。
// 先頭だけ見ると `/<タブ>/evil.example` が通り、取り除かれて `//evil.example` になる。
// 制御文字を含まない前提なら、先頭の検査（`//` と `/\`）だけで足りる。docs/auth-design.md 7 章。
function hasControlCharacter(value: string): boolean {
  // 正規表現 /[\u0000-\u001F\u007F]/ と同じ検査。lint の no-control-regex を避けるため文字コードで見る。
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function safeNext(value: string | null | undefined): string {
  if (!value) return '/'
  if (!value.startsWith('/')) return '/'
  if (value.startsWith('//') || value.startsWith('/\\')) return '/'
  if (hasControlCharacter(value)) return '/'
  return value
}
