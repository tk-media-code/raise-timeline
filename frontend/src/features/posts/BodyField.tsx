import { useEffect, useId, useRef } from 'react'
import { remainingChars } from './validation'

type BodyFieldProps = {
  id: string
  value: string
  onChange: (value: string) => void
  // 入力欄の下に出す誤り（サーバーの 422 の body）。
  error?: string | null
  // 描かれたときに入力欄へフォーカスを置く。ダイアログの中では ModalDialog が、開いてから置く。
  focusOnMount?: boolean
}

// 本文の入力欄と、残り文字数、誤りの表示。投稿フォームと編集ダイアログで共有する。
export function BodyField({ id, value, onChange, error, focusOnMount }: BodyFieldProps) {
  const counterId = useId()
  const errorId = useId()
  const remaining = remainingChars(value)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // React の autoFocus は使わない。ダイアログの中では、開く前にフォーカスが入力欄へ移り、
  // ダイアログを閉じたときの戻り先（開く前にいた場所）が分からなくなる。
  useEffect(() => {
    const textarea = textareaRef.current
    if (focusOnMount && textarea && !textarea.closest('dialog')) textarea.focus()
  }, [focusOnMount])
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        本文
      </label>
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="本文を入力"
        rows={4}
        // ModalDialog が、開いたあとにフォーカスを置く入力欄を見つける印。
        data-autofocus={focusOnMount ? '' : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${counterId} ${errorId}` : counterId}
        className={
          'w-full resize-y rounded-md border bg-white p-3 text-black focus:outline-2 focus:outline-sky-600 ' +
          (error ? 'border-red-600' : 'border-gray-400')
        }
      />
      <p
        id={counterId}
        className={'text-right text-sm ' + (remaining < 0 ? 'font-bold text-red-700' : 'text-gray-600')}
      >
        {`残り ${remaining} 文字`}
      </p>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
