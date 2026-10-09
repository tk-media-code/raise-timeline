import { useId } from 'react'
import { bioRemaining } from './validation'

type BioFieldProps = {
  id: string
  value: string
  onChange: (value: string) => void
  // 入力欄の下に出す誤り（サーバーの 422 の bio）。
  error?: string
}

// 自己紹介の入力欄と、残り文字数、誤りの表示。見た目は投稿の BodyField と同じだが、
// こちらは「自己紹介」というラベルを見せる（設定の画面では、何の欄かが見えている必要がある）。
export function BioField({ id, value, onChange, error }: BioFieldProps) {
  const counterId = useId()
  const errorId = useId()
  const remaining = bioRemaining(value)
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-black">
        自己紹介
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
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
