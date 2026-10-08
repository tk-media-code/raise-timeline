import { Navigate, Outlet } from 'react-router'
import { useAuth } from './AuthProvider'

// ログイン・登録画面の入口。ログイン済みの人には見せず、ホームへ送る。
// loading の間は中身を出す。待たせるとログイン画面が一瞬見えなくなるうえ、
// 未ログインの人（起動時の更新が 401 になる人）が毎回スピナーを見ることになる。
export function RedirectIfAuthenticated() {
  const { status } = useAuth()

  if (status === 'authenticated') return <Navigate to="/" replace />
  return <Outlet />
}
