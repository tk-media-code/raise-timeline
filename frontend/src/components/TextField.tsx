import type { ChangeEvent } from 'react'

type TextFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'email' | 'password'
  error?: string
  autoComplete?: string
  maxLength?: number
}

// ラベル・入力欄・誤りの表示を 1 組にした部品。
// 誤りは role="alert" にして、送信後に出た文言をスクリーンリーダーにも読ませる。入力欄とは aria-describedby で結ぶ。
export function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  error,
  autoComplete,
  maxLength,
}: TextFieldProps) {
  const errorId = id + '-error'
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-black">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        autoComplete={autoComplete}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={
          'min-h-11 rounded-md border bg-white px-3 text-black focus:outline-2 focus:outline-sky-600 ' +
          (error ? 'border-red-600' : 'border-gray-400')
        }
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
