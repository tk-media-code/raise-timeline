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

export function register(input: RegisterInput): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/register', { method: 'POST', body: input, ...NO_BEARER })
}

export function login(input: LoginInput): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/login', { method: 'POST', body: input, ...NO_BEARER })
}

export function refresh(): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/refresh', { method: 'POST', ...NO_BEARER })
}

export function logout(): Promise<void> {
  return apiFetch<void>('/api/auth/logout', { method: 'POST', ...NO_BEARER })
}
