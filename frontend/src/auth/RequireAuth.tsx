import { Navigate, Outlet, useLocation } from 'react-router'
import { Spinner } from '../components/Spinner'
import { useAuth } from './AuthProvider'

// ログインが要るルートの入口。
// loading の間に /login へ飛ばすと、ログイン済みの人が画面の読み直しのたびにログイン画面を見ることになる。
export function RequireAuth() {
  const { status } = useAuth()
  const { pathname, search } = useLocation()

  if (status === 'loading') return <Spinner />
  if (status === 'anonymous') {
    // ログイン後に元の画面へ戻せるよう、パスとクエリを next に載せる。next の検査は受け取る側（safeNext）。
    return <Navigate to={'/login?next=' + encodeURIComponent(pathname + search)} replace />
  }
  return <Outlet />
}
