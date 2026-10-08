import { Navigate, Outlet, useLocation } from 'react-router'
import { Spinner } from '../components/Spinner'
import { useAuth } from './AuthProvider'

// ログインが要るルートの入口。
// loading の間に /login へ飛ばすと、ログイン済みの人が画面の読み直しのたびにログイン画面を見ることになる。
export function RequireAuth() {
  const { status, signedOut } = useAuth()
  const { pathname, search } = useLocation()

  if (status === 'loading') return <Spinner />
  if (status === 'anonymous') {
    // 自分でログアウトしたときは、元の画面へ戻す理由が無い。next を付けると、次にログインした人が前の人の画面に着く。
    if (signedOut) return <Navigate to="/login" replace />
    // ログイン後に元の画面へ戻せるよう、パスとクエリを next に載せる。next の検査は受け取る側（safeNext）。
    return <Navigate to={'/login?next=' + encodeURIComponent(pathname + search)} replace />
  }
  return <Outlet />
}
