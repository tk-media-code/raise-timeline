import { Link } from 'react-router'

type Tab = { to: string; label: string; current: boolean }

// 画面の上にあるタブの並び（ホームの「フォロー中」「すべて」、フォロー一覧の「フォロー中」「フォロワー」）。
// 線は全部のタブに引き、選んでいるタブだけ色を付ける。選んでいるタブだけに線があると、そのタブの文字が 1px 上がる。
export function TabNav({ label, tabs }: { label: string; tabs: Tab[] }) {
  return (
    <nav aria-label={label} className="flex border-b border-gray-200">
      {tabs.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          aria-current={tab.current ? 'page' : undefined}
          className={
            'inline-flex min-h-11 min-w-11 items-center border-b-2 px-4 focus:outline-2 focus:outline-offset-2 focus:outline-sky-600 ' +
            (tab.current ? 'border-sky-600 font-bold' : 'border-transparent')
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
