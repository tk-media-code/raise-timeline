// 登録した年月を日本時間で組み立てる。getFullYear() などは端末のタイムゾーンで答えるので、
// 月末月初の登録は海外の端末や UTC のテスト環境で月がずれる。
// formatTime.ts と同じく、書式はロケールに任せず、部品だけ取って自分で並べる。
const formatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'numeric',
})

// 例: 2026年10月に登録。
export function formatJoined(iso: string): string {
  let year = ''
  let month = ''
  for (const part of formatter.formatToParts(new Date(iso))) {
    if (part.type === 'year') year = part.value
    if (part.type === 'month') month = part.value
  }
  return `${Number(year)}年${Number(month)}月に登録`
}
