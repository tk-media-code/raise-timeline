type AvatarProps = {
  userId: string
  displayName: string
  avatarUrl: string | null
  size?: number
}

// 白い文字を載せても読める濃さの色。Tailwind は完全なクラス名を拾うので、文字列を組み立てずに並べる。
const COLORS = [
  'bg-red-700',
  'bg-orange-700',
  'bg-green-700',
  'bg-teal-700',
  'bg-blue-700',
  'bg-violet-700',
  'bg-pink-700',
  'bg-slate-700',
]

// 色は利用者 id から決める。表示名から決めると、プロフィール編集で表示名を変えたときに色が変わってしまう。
function colorOf(userId: string): string {
  let sum = 0
  for (const char of userId) sum += char.codePointAt(0) ?? 0
  return COLORS[sum % COLORS.length]
}

// 画像が無いときは表示名の頭文字を丸に出す。
// 頭文字は Array.from で取る。先頭を [0] で取ると、絵文字などのサロゲートペアを半分に割ってしまう。
// 表示名は隣に文字で出るので、画像の alt は空にして二重に読み上げさせない。
export function Avatar({ userId, displayName, avatarUrl, size = 40 }: AvatarProps) {
  const dimension = { width: size, height: size }
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" style={dimension} className="shrink-0 rounded-full object-cover" />
  }
  return (
    <div
      aria-hidden="true"
      style={{ ...dimension, fontSize: size * 0.45 }}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${colorOf(userId)}`}
    >
      {Array.from(displayName)[0] ?? ''}
    </div>
  )
}
