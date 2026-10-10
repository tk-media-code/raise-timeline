import { Route, Routes } from 'react-router'
import { RedirectIfAuthenticated } from './auth/RedirectIfAuthenticated'
import { RequireAuth } from './auth/RequireAuth'
import { AppLayout } from './components/layout/AppLayout'
import HomePage from './pages/HomePage'
import LikersPage from './pages/LikersPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import PostDetailPage from './pages/PostDetailPage'
import ProfileEditPage from './pages/ProfileEditPage'
import ProfilePage from './pages/ProfilePage'
import RegisterPage from './pages/RegisterPage'

export default function App() {
  return (
    <Routes>
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/posts/:id" element={<PostDetailPage />} />
          <Route path="/posts/:id/likes" element={<LikersPage />} />
          <Route path="/users/:username" element={<ProfilePage />} />
          <Route path="/settings/profile" element={<ProfileEditPage />} />
        </Route>
      </Route>
      {/* レイアウトの外。ナビを出さず、未ログインでも開ける。 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
