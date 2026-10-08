import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { logout, type AuthResponse, type Me } from '../api/auth'
import { queryClient } from '../lib/queryClient'
import { onSessionExpired, refreshSession } from './refresh'
import { setAccessToken } from './tokenStore'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type AuthContextValue = {
  status: AuthStatus
  user: Me | null
  signIn: (response: AuthResponse) => void
  signOut: () => Promise<void>
}

// status と user は食い違うと困る（authenticated なのに user が無い等）ので、1 つの状態にまとめて同時に更新する。
type AuthState = { status: AuthStatus; user: Me | null }

const ANONYMOUS: AuthState = { status: 'anonymous', user: null }

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null })
  // StrictMode は開発時に effect を「実行 → 後始末 → 再実行」する。ref は 2 回目にも残るので、
  // 起動時の更新を 1 回に絞れる。モジュール側の単一飛行に頼らないのは、そちらは「同時に走る分」しか束ねず、
  // 1 回目が終わったあとの 2 回目は改めて更新してしまうため。
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    // 後始末で結果を捨てない。StrictMode の擬似アンマウントは同じコンポーネントのままなので、
    // 捨てると 1 回目の結果が失われて loading のまま止まる。
    void (async () => {
      try {
        const session = await refreshSession()
        setState(session ? { status: 'authenticated', user: session.user } : ANONYMOUS)
      } catch {
        // 500・通信失敗。ログイン画面から入り直せるので、loading のまま止めない。
        setState(ANONYMOUS)
      }
    })()
  }, [])

  // 画面の途中で更新が 401 になったら、ログアウト状態にする。
  // 保護されたルートが /login?next= へ移すので、ここでは移動しない。
  useEffect(() => onSessionExpired(() => setState(ANONYMOUS)), [])

  const signIn = useCallback((response: AuthResponse) => {
    setAccessToken(response.accessToken)
    setState({ status: 'authenticated', user: response.user })
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } catch {
      // サーバーに届かなくても、この端末では必ずログアウト状態にする。
    }
    setAccessToken(null)
    setState(ANONYMOUS)
    // 前の利用者のキャッシュを残さない。
    queryClient.clear()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status: state.status, user: state.user, signIn, signOut }),
    [state, signIn, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

// フックを Provider と同じファイルに置くのは、Context を外に出さないため。
// oxlint-disable-next-line react/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth は AuthProvider の中で呼ぶ')
  return value
}
