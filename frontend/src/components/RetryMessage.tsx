// 読み込みの失敗と「再試行」。画面全体の取得（詳細・プロフィール）と一覧の続きで同じ見た目にする。
export function RetryMessage({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <p>読み込みに失敗しました</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 min-w-11 rounded-md border border-gray-400 bg-white px-4 text-black focus:outline-2 focus:outline-offset-2 focus:outline-sky-600"
      >
        再試行
      </button>
    </div>
  )
}
