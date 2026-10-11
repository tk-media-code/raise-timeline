import { useEffect, useRef, type RefObject } from 'react'

// 送信の完了を待つ間に、フォームがダイアログごと閉じられることがある。
// 完了後の続きが、閉じたあとの画面（あるいは開き直した別のフォーム）に作用しないよう、今も描かれているかを見る。
// StrictMode は effect を「実行 → 後始末 → 再実行」するので、再実行で true に戻す。
export function useIsMounted(): RefObject<boolean> {
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}
