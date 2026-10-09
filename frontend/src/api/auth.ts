import { withAuthLock } from '../auth/authLock'
import { apiFetch } from './client'

export type Me = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  bio: string
  isFollowing: boolean
  followersCount: number
  followingCount: number
  createdAt: string
  isMe: boolean
  email: string
}

export type AuthResponse = { accessToken: string; user: Me }

export type RegisterInput = {
  username: string
  displayName: string
  email: string
  password: string
}

export type LoginInput = { email: string; password: string }

// この 4 つは本文か Cookie で認証するので、Bearer を付けず、401 でも更新してやり直さない。
// 期限の切れたアクセストークンを付けると、サーバーの Bearer の検証が先に 401 を返し、
// ログアウトが Cookie を消せなくなる。
const NO_BEARER = { auth: false, retryOn401: false } as const

// register・login・logout は、更新と同じ鍵の中で送る。
// 更新の応答が遅れて届くと、その後に済んだログインやログアウトの Cookie を古い値に戻してしまうため。
// 鍵は入れ子にしない。Web Locks は再入できず、鍵の中で更新（refreshSession）を呼ぶと止まる。
// 中の apiFetch は NO_BEARER なので、401 でも更新を呼ばない。
// refresh() は鍵を取らない。鍵は呼び出し側の refreshSession が取る。
export function register(input: RegisterInput): Promise<AuthResponse> {
  return withAuthLock(() =>
    apiFetch<AuthResponse>('/api/auth/register', { method: 'POST', body: input, ...NO_BEARER }),
  )
}

export function login(input: LoginInput): Promise<AuthResponse> {
  return withAuthLock(() => apiFetch<AuthResponse>('/api/auth/login', { method: 'POST', body: input, ...NO_BEARER }))
}

export function refresh(): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/refresh', { method: 'POST', ...NO_BEARER })
}

export function logout(): Promise<void> {
  return withAuthLock(() => apiFetch<void>('/api/auth/logout', { method: 'POST', ...NO_BEARER }))
}
