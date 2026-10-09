// 読み込み中の表示。<output> は暗黙の role="status" を持つので、スクリーンリーダーにも伝わる。
export function Spinner() {
  return (
    <output aria-label="読み込み中" className="flex justify-center p-8">
      <div
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-700"
      />
    </output>
  )
}
