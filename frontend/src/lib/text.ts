// 文字数は Unicode のコードポイントで数える。`text.length` は UTF-16 のコード単位を数えるので、
// 絵文字（サロゲートペア）が 2 文字になり、バックエンドの検証（コードポイント数）とずれる。
export function countCodePoints(text: string): number {
  return Array.from(text).length
}
