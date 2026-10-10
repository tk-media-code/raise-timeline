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
  // ログアウトの API を呼ばずに、この端末の状態だけを捨てて signedOut にする。退会のあとに使う
  // （Cookie はサーバーの応答が消していて、呼ぶべきログアウトの相手がもういない）。
  signOutLocally: () => void
  // プロフィールを保存したあとに、ログイン中の利用者の表示を新しい内容に差し替える。
  // トークンやセッションは触らない。今の利用者と id が違うときや、ログイン状態でないときは何もしない。
  updateUser: (user: Me) => void
  // アイコンを差し替えたあとに、ログイン中の利用者の avatarUrl だけを新しくする。
  // updateUser と同じく、id が違うときや、ログイン状態でないときは何もしない。
  updateAvatarUrl: (userId: string, avatarUrl: string) => void
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

  // この端末の状態を捨てて signedOut にする。signOut（API のあと）と退会のあとで共有する。
  const signOutLocally = useCallback(() => {
    // 進行中の更新が、消したトークンを書き戻さないようにする。
    advanceSessionGeneration()
    setAccessToken(null)
    setSessionUserId(null)
    setState(SIGNED_OUT)
    // 前の利用者のキャッシュを残さない。
    queryClient.clear()
    // 他のタブにも知らせる。サーバーに届かなかったとき（signOut の API の失敗）も同じ。
    // 届かなかった側のタブも、次に取り直せば同じ結果になる。
    announceAuthChanged()
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } catch {
      // サーバーに届かなくても、この端末では必ずログアウト状態にする。
    }
    signOutLocally()
  }, [signOutLocally])

  // 保存の応答は、送ってから返るまでに時間がかかる。その間にログアウトや別の人のログインがあり得るので、
  // 呼ばれた時点の状態ではなく、最新の状態と突き合わせる（関数形の setState）。
  // 他のタブへは知らせない。知らせると、受け取ったタブがトークンの更新から取り直してしまうため。
  // 他のタブは、読み直すまで古い表示のまま。
  const updateUser = useCallback((user: Me) => {
    setState((prev) =>
      prev.status === 'authenticated' && prev.user?.id === user.id ? { ...prev, user } : prev,
    )
  }, [])

  // アイコンの応答は avatarUrl しか返さない。me 全体を作り直すと、開いたあとに変わった他の項目を古い値で上書きしうる。
  const updateAvatarUrl = useCallback((userId: string, avatarUrl: string) => {
    setState((prev) =>
      prev.status === 'authenticated' && prev.user?.id === userId ? { ...prev, user: { ...prev.user, avatarUrl } } : prev,
    )
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      signedOut: state.signedOut,
      signIn,
      signOut,
      signOutLocally,
      updateUser,
      updateAvatarUrl,
    }),
    [state, signIn, signOut, signOutLocally, updateUser, updateAvatarUrl],
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
