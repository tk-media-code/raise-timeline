// 画面の日時は日本時間で組み立てる。Date の getHours() などは端末のタイムゾーンで答えるので、
// 海外の端末や、UTC で動くテストの実行環境では日付がずれる。
// toLocaleString('ja-JP') の書式にも頼らない。ロケールデータの版で区切りや桁が揺れるので、部品だけ取って自分で並べる。
const formatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  // 'h23' を明示する。指定しないと 0 時を「24」と返す環境がある。
  hourCycle: 'h23',
})

type Parts = { year: number; month: number; day: number; hour: number; minute: number }

function partsOf(date: Date): Parts {
  const parts = { year: 0, month: 0, day: 0, hour: 0, minute: 0 }
  for (const part of formatter.formatToParts(date)) {
    if (part.type in parts) parts[part.type as keyof Parts] = Number(part.value)
  }
  return parts
}

const pad = (value: number) => String(value).padStart(2, '0')

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// 1 分未満と未来は「たった今」。サーバーと端末の時計は数分ずれることがあり、「-3 分前」とは出せない。
// 24 時間以上前は日付にする。同じ年なら年を省き、年の比較は日本時間で行う。
export function formatRelativeTime(iso: string, now: Date): string {
  const created = new Date(iso)
  const elapsed = now.getTime() - created.getTime()
  if (elapsed < MINUTE) return 'たった今'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} 分前`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} 時間前`

  const date = partsOf(created)
  const md = `${date.month}月${date.day}日`
  return date.year === partsOf(now).year ? md : `${date.year}年${md}`
}

// 例: 2026/10/06 14:12。time 要素の title に使う。
export function formatAbsoluteTime(iso: string): string {
  const date = partsOf(new Date(iso))
  return `${date.year}/${pad(date.month)}/${pad(date.day)} ${pad(date.hour)}:${pad(date.minute)}`
}
