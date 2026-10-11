import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { ComposeDialog } from '../../features/posts/ComposeDialog'
import { Avatar } from '../Avatar'
import { ConfirmDialog } from '../ConfirmDialog'

// ログイン後の画面の枠。Tailwind の md（768px）を境に、PC は左ナビ、スマホは上部バーと下部タブに切り替える。
// 切り替えは CSS だけで行うので、DOM には両方が常にある（テストでも両方が描かれる）。
const NAV_CLASS = 'flex min-h-11 items-center rounded-md px-3 text-black hover:bg-gray-100'
const ACTIVE_CLASS = 'font-bold text-sky-600'

function navClass({ isActive }: { isActive: boolean }): string {
  return NAV_CLASS + (isActive ? ' ' + ACTIVE_CLASS : '')
}

function tabClass({ isActive }: { isActive: boolean }): string {
  return 'flex min-h-14 flex-1 items-center justify-center text-sm text-black' + (isActive ? ' font-bold text-sky-600' : '')
}

// React Router は大文字小文字と末尾の / を区別せずに画面を選ぶ（/Settings/profile も /users/bob/followers/ も開く）。
// 画面名と丸ボタンの判定だけが文字どおりに比べるとずれるので、判定の前に 1 回そろえる（小文字にして、末尾の / を除く。/ だけは残す）。
function normalizePath(pathname: string): string {
  const lower = pathname.toLowerCase()
  return lower.length > 1 && lower.endsWith('/') ? lower.replace(/\/+$/, '') || '/' : lower
}

// 上部バーに出す画面名。まだ画面が無いものは、ロゴの名前に倒す。pathname は normalizePath を通したもの。
function screenName(pathname: string): string {
  if (pathname === '/') return 'ホーム'
  if (pathname.startsWith('/search')) return '検索'
  // /users/ の判定より前に置く（プロフィールの下の画面）。
  if (/^\/users\/[^/]+\/followers$/.test(pathname)) return 'フォロワー'
  if (/^\/users\/[^/]+\/following$/.test(pathname)) return 'フォロー中'
  if (pathname.startsWith('/users/')) return 'プロフィール'
  if (pathname === '/settings/profile') return 'プロフィール編集'
  if (/^\/posts\/[^/]+\/likes$/.test(pathname)) return 'いいねした人'
  if (pathname.startsWith('/posts/')) return '投稿'
  return 'raise-timeline'
}

export function AppLayout() {
  const { user, signOut } = useAuth()
  const { pathname: rawPathname } = useLocation()
  const pathname = normalizePath(rawPathname)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)

  // 認証済みの枠の中でしか使わない。ログアウト直後に user が空になる 1 回の描画だけは、何も出さずに RequireAuth の移動に任せる。
  if (!user) return null

  const profilePath = `/users/${user.username}`
  // 設定の画面では丸いボタンを出さない。設定から投稿する必要は無く、右下に固定したボタンが
  // 右寄せの「保存」（今後は「退会」の節のボタンも）に重なって、短い画面では押せなくなるため。PC の左ナビの「投稿する」は残す。
  const showPhoneComposeButton = !pathname.startsWith('/settings/')

  function askLogout() {
    setMenuOpen(false)
    setConfirmOpen(true)
  }

  function confirmLogout() {
    setConfirmOpen(false)
    // 移動はここでしない。ログアウト状態になったことを見て、RequireAuth が /login へ移す。
    // ここで navigate すると、場所の更新の順序の都合で RequireAuth の移動に負ける。
    void signOut()
  }

  return (
    <div className="min-h-screen bg-white text-black md:flex">
      <header
        aria-label="上部バー"
        className="sticky top-0 z-10 flex min-h-14 items-center justify-between border-b border-gray-200 bg-white px-4 md:hidden"
      >
        {/* 見出しにしない。この帯は md 以上で隠れるので、h1 を持たせると PC 幅で h1 が無くなる。見出しは各ページが持つ。 */}
        <p className="text-lg font-bold">{screenName(pathname)}</p>
        <div className="relative">
          <button
            type="button"
            aria-label="メニュー"
            aria-expanded={menuOpen}
            aria-controls="phone-menu"
            onClick={() => setMenuOpen((value) => !value)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-xl hover:bg-gray-100"
          >
            <span aria-hidden="true">≡</span>
          </button>
          {menuOpen && (
            <div
              id="phone-menu"
              className="absolute right-0 mt-1 w-40 rounded-md border border-gray-200 bg-white p-1 shadow-lg"
            >
              <button type="button" onClick={askLogout} className={NAV_CLASS + ' w-full'}>
                ログアウト
              </button>
            </div>
          )}
        </div>
      </header>

      <nav
        aria-label="メインメニュー"
        className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:gap-1 md:border-r md:border-gray-200 md:p-4"
      >
        <p className="mb-4 px-3 text-xl font-bold text-sky-600">raise-timeline</p>
        <NavLink to="/" end className={navClass}>
          ホーム
        </NavLink>
        <NavLink to="/search" className={navClass}>
          検索
        </NavLink>
        <NavLink to={profilePath} className={navClass}>
          プロフィール
        </NavLink>
        <button type="button" onClick={askLogout} className={NAV_CLASS + ' w-full text-left'}>
          ログアウト
        </button>
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="mt-3 min-h-11 rounded-full bg-sky-600 px-4 font-bold text-white hover:bg-sky-700"
        >
          投稿する
        </button>
        <div className="mt-auto flex items-center gap-3 px-3 py-2">
          <Avatar userId={user.id} displayName={user.displayName} avatarUrl={user.avatarUrl} />
          <span className="truncate font-bold">{user.displayName}</span>
        </div>
      </nav>

      {/* 下の余白は、固定の下部タブ（pb-16）に隠れない分。右下の丸い＋ボタンがあるスマホ幅では、さらにその分（pb-36）を空ける。
          空けないと、一覧の最後のカードのフォローボタンが＋ボタンの下に隠れて押せない。
          PC 幅（md 以上）は下部タブも＋ボタンも無いが、通知が画面の下（md:bottom-4）に固定されるので、
          ページの最後の要素（「退会する」ボタンなど）がその下に入ったままにならないよう、md:pb-24 を空ける。 */}
      <main className={'mx-auto w-full max-w-[800px] md:pb-24 ' + (showPhoneComposeButton ? 'pb-36' : 'pb-16')}>
        <Outlet />
      </main>

      <nav
        aria-label="下部タブ"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-gray-200 bg-white md:hidden"
      >
        <NavLink to="/" end className={tabClass}>
          ホーム
        </NavLink>
        <NavLink to="/search" className={tabClass}>
          検索
        </NavLink>
        <NavLink to={profilePath} className={tabClass}>
          プロフィール
        </NavLink>
      </nav>

      {/* スマホでは左ナビが無いので、下部タブの上に丸いボタンを置く。見た目は ＋、名前は「投稿する」。 */}
      {showPhoneComposeButton && (
        <button
          type="button"
          aria-label="投稿する"
          onClick={() => setComposeOpen(true)}
          className="fixed right-4 bottom-18 z-10 flex min-h-14 min-w-14 items-center justify-center rounded-full bg-sky-600 text-3xl text-white shadow-lg hover:bg-sky-700 md:hidden"
        >
          <span aria-hidden="true">＋</span>
        </button>
      )}

      <ComposeDialog open={composeOpen} onClose={() => setComposeOpen(false)} />

      <ConfirmDialog
        open={confirmOpen}
        title="ログアウトしますか？"
        description="この端末のログイン状態を破棄します。"
        confirmLabel="ログアウト"
        onConfirm={confirmLogout}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
