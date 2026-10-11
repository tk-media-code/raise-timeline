import { useEffect, useId, useRef, useState, type ChangeEvent, type CompositionEvent, type FormEvent } from 'react'

// 入力が止まってから検索するまでの待ち。
export const SEARCH_DEBOUNCE_MS = 400

type SearchBoxProps = {
  // 欄の最初の文字。あとから変わっても欄は書き換えない（入力中の文字を壊さないため）。作り直したいときは呼ぶ側が key を変える。
  defaultValue: string
  // 欄の下に出す誤り。
  error: string | null
  // 検索するとき（入力が止まって 400 ミリ秒後、または Enter）に、欄の文字をそのまま渡す。空白を除くのは呼ぶ側。
  onSearch: (raw: string) => void
}

// 検索の欄。欄の文字と、検索を始めるタイミング（400 ミリ秒待つ、変換中は待つ、Enter ですぐ）をここに閉じ込める。
// 入力が変わるたびに待ちを掛け直す。変換（IME）の途中の文字では検索しない: compositionstart で待ちを止め、
// compositionend で掛け直す。Enter はフォームの送信で、待ちを止めてすぐ検索する（あとから待ちが 2 回目を起こさない）。
export function SearchBox({ defaultValue, error, onSearch }: SearchBoxProps) {
  const [value, setValue] = useState(defaultValue)
  const errorId = useId()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composing = useRef(false)
  // タイマーの中から見る、いまの欄の文字と onSearch。描画のたびに最新にする。
  const latest = useRef({ value: defaultValue, onSearch })
  useEffect(() => {
    latest.current.onSearch = onSearch
  })

  function cancel() {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }

  function schedule() {
    cancel()
    timer.current = setTimeout(() => {
      timer.current = null
      latest.current.onSearch(latest.current.value)
    }, SEARCH_DEBOUNCE_MS)
  }

  // 外されるときは、待っていた検索を捨てる。
  useEffect(() => cancel, [])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setValue(event.target.value)
    latest.current.value = event.target.value
    if (!composing.current) schedule()
  }

  function handleCompositionStart() {
    composing.current = true
    cancel()
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
    composing.current = false
    // 確定した文字で検索する。ブラウザによっては、確定の change が compositionend の後に来るので、そちらでも掛け直される。
    latest.current.value = event.currentTarget.value
    schedule()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    cancel()
    latest.current.onSearch(latest.current.value)
  }

  return (
    // <search> 要素でなく role="search" にしているのは、古い読み上げ環境でも検索のランドマークとして伝わるようにするため。
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <form role="search" noValidate onSubmit={handleSubmit} className="border-b border-gray-200 p-4">
      <input
        type="search"
        aria-label="ユーザー名か表示名"
        placeholder="ユーザー名か表示名で探す"
        value={value}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
        autoComplete="off"
        className="min-h-11 w-full rounded-md border border-gray-400 bg-white px-3 text-black focus:outline-2 focus:outline-offset-2 focus:outline-sky-600"
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  )
}
