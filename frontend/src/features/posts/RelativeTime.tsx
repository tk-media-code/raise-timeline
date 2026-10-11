import { useNow } from '../../lib/useNow'
import { formatRelativeTime } from './formatTime'

// 「3 分前」のような相対時刻の文字。1 分ごとに進む今の時刻を、ここだけが購読する。
// 購読を呼び出し側のカードに置くと、1 分ごとにカードの全体が描き直される。絶対時刻のカードはこの部品を使わず、何も購読しない。
// now はテスト用。渡さなければ、1 分ごとに進む今の時刻を使う。
export function RelativeTime({ createdAt, now }: { createdAt: string; now?: Date }) {
  const currentTime = useNow()
  return <>{formatRelativeTime(createdAt, now ?? currentTime)}</>
}
