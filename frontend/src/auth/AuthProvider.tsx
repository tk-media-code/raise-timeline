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
import { announceAuthChanged, onAuthChangedElsewhere } from './authChannel'
import { onSessionExpired, refreshSession } from './refresh'
import { advanceSessionGeneration, getSessionGeneration, setAccessToken, setSessionUserId } from './tokenStore'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type AuthContextValue = {
  status: AuthStatus
  user: Me | null
  // 利用者が自分でログアウトしたあとの anonymous かどうか。起動時の更新の失敗や期限切れの anonymous とは区別する。
  // 保護されたルートが、前者では next を付けずに /login へ、後者では元の画面に戻れるよう next を付けて移すため。
  signedOut: boolean
  signIn: (response: AuthResponse) => void
  signOut: () => Promise<void>
}

// status と user は食い違うと困る（authenticated なのに user が無い等）ので、1 つの状態にまとめて同時に更新する。
type AuthState = { status: AuthStatus; user: Me | null; signedOut: boolean }

const LOADING: AuthState = { status: 'loading', user: null, signedOut: false }
const ANONYMOUS: AuthState = { status: 'anonymous', user: null, signedOut: false }
const SIGNED_OUT: AuthState = { status: 'anonymous', user: null, signedOut: true }

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(LOADING)
  // StrictMode は開発時に effect を「実行 → 後始末 → 再実行」する。ref は 2 回目にも残るので、
  // 起動時の更新を 1 回に絞れる。モジュール側の単一飛行に頼らないのは、そちらは「同時に走る分」しか束ねず、
  // 1 回目が終わったあとの 2 回目は改めて更新してしまうため。
  const startedRef = useRef(false)

  // 更新の結果は、始めたときから世代が変わっておらず、かつ、まだ loading のときだけ反映する。
  // loading の間も /login は使えるので、更新が終わる前に signIn・signOut が済むことがある。
  // 他のタブの知らせで取り直している間に、もう一度知らせが届くこともある。
  // そのとき遅れて届いた古い結果（別の人の成功や 401）で、新しい状態を上書きしない。
  const applyRefreshResult = useCallback((startedAt: number, next: AuthState) => {
    if (getSessionGeneration() !== startedAt) return
    setState((prev) => (prev.status === 'loading' ? next : prev))
  }, [])

  // 起動時と取り直しで共通の流れ。更新を呼び、結果を状態にする。
  const loadSession = useCallback(async () => {
    const startedAt = getSessionGeneration()
    try {
      const session = await refreshSession()
      const next: AuthState = session ? { status: 'authenticated', user: session.user, signedOut: false } : ANONYMOUS
      applyRefreshResult(startedAt, next)
    } catch {
      // 500・通信失敗。ログイン画面から入り直せるので、loading のまま止めない。
      applyRefreshResult(startedAt, ANONYMOUS)
    }
  }, [applyRefreshResult])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    // 後始末で結果を捨てない。StrictMode の擬似アンマウントは同じコンポーネントのままなので、
    // 捨てると 1 回目の結果が失われて loading のまま止まる。
    void loadSession()
  }, [loadSession])

  // 画面の途中で更新が 401 になったら（または別の利用者が返ったら）、ログアウト状態にする。
  // 保護されたルートが /login?next= へ移すので、ここでは移動しない。
  // キャッシュも捨てる。残すと、次にログインした人に前の人の一覧が見える。
  useEffect(
    () =>
      onSessionExpired(() => {
        setState(ANONYMOUS)
        queryClient.clear()
      }),
    [],
  )

  // 別のタブでログインかログアウトがあった。リフレッシュ Cookie は全タブで共有なので、
  // こちらのタブが持っているトークンと利用者は、もう別の人のものかもしれない。
  // 全部捨てて、起動時と同じ流れで取り直す。取り直しの間は loading で、書きかけの入力は消える。
  // 世代を進めるのは、進行中の更新（取り直し前の状態を前提にしたもの）の結果を古いものにするため。
  useEffect(
    () =>
      onAuthChangedElsewhere(() => {
        advanceSessionGeneration()
        setAccessToken(null)
        setSessionUserId(null)
        queryClient.clear()
        setState(LOADING)
        void loadSession()
      }),
    [loadSession],
  )

  const signIn = useCallback((response: AuthResponse) => {
    // 進行中の更新の結果を古いものにする。先に進めてからトークンを置く。
    advanceSessionGeneration()
    setAccessToken(response.accessToken)
    setSessionUserId(response.user.id)
    setState({ status: 'authenticated', user: response.user, signedOut: false })
    // 状態を作ってから知らせる。受け取ったタブが取り直すとき、Cookie はもうこの利用者のものになっている。
    announceAuthChanged()
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } catch {
      // サーバーに届かなくても、この端末では必ずログアウト状態にする。
    }
    // 進行中の更新が、消したトークンを書き戻さないようにする。
    advanceSessionGeneration()
    setAccessToken(null)
    setSessionUserId(null)
    setState(SIGNED_OUT)
    // 前の利用者のキャッシュを残さない。
    queryClient.clear()
    // API が失敗したときも知らせる。届かなかった側のタブも、次に取り直せば同じ結果になる。
    announceAuthChanged()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status: state.status, user: state.user, signedOut: state.signedOut, signIn, signOut }),
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
