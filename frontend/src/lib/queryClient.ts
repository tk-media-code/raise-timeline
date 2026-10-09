import { QueryClient } from '@tanstack/react-query'

// 既定は retry: false、refetchOnWindowFocus: false。
// 失敗したらすぐ「再試行」か「見つかりません」を出す。TanStack Query の既定は 3 回まで間を置いて再試行するので、
// 404 でも画面がしばらく読み込み中のままになる。
// 前面に戻るたびの取り直しも止める。無限スクロールで読み込んだ全ページを、そのたびに取り直してしまうため。
// テストも同じ既定の新しいクライアントを使えるよう、作る部分を関数にしてある。
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
}

// アプリで 1 つだけ使う。React の外（AuthProvider の signOut）からも触るのでモジュールに置く。
// ログアウト時に clear() しないと、前の利用者のキャッシュが次にログインした人に見えてしまう。
export const queryClient = createQueryClient()
