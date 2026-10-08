import { Navigate, Outlet, useSearchParams } from 'react-router'
import { useAuth } from './AuthProvider'
import { safeNext } from './safeNext'

// ログイン・登録画面の入口。ログイン済みの人には見せず、?next= の画面（無ければホーム）へ送る。
//
// ログイン後の移動はここだけで行う。ログイン画面は signIn を呼ぶだけにして、自分では navigate しない。
// react-router は場所の更新を startTransition で包むので、signIn の setState（通常の更新）が先に描かれ、
// 場所がまだ /login のまま authenticated になる。このとき、ここの <Navigate to="/"> の移動が
// ログイン画面の navigate(next) を上書きして、next に戻れなくなる。移動をここに一本化すれば競合しない。
//
// loading の間は中身を出す。待たせるとログイン画面が一瞬見えなくなるうえ、
// 未ログインの人（起動時の更新が 401 になる人）が毎回スピナーを見ることになる。
export function RedirectIfAuthenticated() {
  const { status } = useAuth()
  const [searchParams] = useSearchParams()

  // next は利用者が書き換えられる入力なので、必ず safeNext を通す。
  if (status === 'authenticated') return <Navigate to={safeNext(searchParams.get('next'))} replace />
  return <Outlet />
}
