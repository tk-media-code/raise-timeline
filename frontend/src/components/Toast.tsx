import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type ToastKind = 'success' | 'error'
type ToastItem = { id: number; message: string; kind: ToastKind }
type ToastContextValue = { show: (message: string, kind?: ToastKind) => void }

const SUCCESS_DURATION_MS = 4000

const ToastContext = createContext<ToastContextValue | null>(null)

// 成功は一定時間で自分で消える。失敗は消さない:
// 500 の通知には requestId が載り、利用者はそれを写し取って問い合わせる。時間で消えると写し取る前に失われる。
// 消える時刻は通知ごとに持つ。Provider 側で 1 本のタイマーを共有すると、後から出た通知が先の通知の時刻を巻き込む。
function ToastView({ toast, onClose }: { toast: ToastItem; onClose: (id: number) => void }) {
  const { id, kind } = toast

  useEffect(() => {
    if (kind !== 'success') return
    const timer = setTimeout(() => onClose(id), SUCCESS_DURATION_MS)
    return () => clearTimeout(timer)
  }, [id, kind, onClose])

  if (kind === 'error') {
    return (
      <div
        role="alert"
        className="pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-md bg-red-700 p-3 text-sm text-white shadow-lg"
      >
        <p className="flex-1 break-words">{toast.message}</p>
        <button
          type="button"
          onClick={() => onClose(id)}
          className="min-h-11 min-w-11 shrink-0 rounded-md px-2 font-bold underline focus:outline-2 focus:outline-offset-2 focus:outline-white"
        >
          閉じる
        </button>
      </div>
    )
  }
  return (
    <output className="pointer-events-auto block w-full max-w-md rounded-md bg-gray-900 p-3 text-sm text-white shadow-lg">
      {toast.message}
    </output>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const close = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  // 呼び出し側の effect の依存に入れても取り直しにならないよう、関数の同一性を保つ。
  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId.current++
    setToasts((current) => [...current, { id, message, kind }])
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* 画面の下。スマホでは下部タブ（高さ 3.5rem）と丸い投稿ボタン（下から 72〜128px）の上に出す。新しいものを下に積む。 */}
      <div className="pointer-events-none fixed inset-x-0 bottom-36 z-50 flex flex-col items-center gap-2 px-4 md:bottom-4">
        {toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} onClose={close} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// フックを Provider と同じファイルに置くのは、Context を外に出さないため。
// oxlint-disable-next-line react/only-export-components
export function useToast(): ToastContextValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast は ToastProvider の中で呼ぶ')
  return value
}
