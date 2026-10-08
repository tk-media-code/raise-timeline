import { QueryClient } from '@tanstack/react-query'

// アプリで 1 つだけ使う。React の外（AuthProvider の signOut）からも触るのでモジュールに置く。
// ログアウト時に clear() しないと、前の利用者のキャッシュが次にログインした人に見えてしまう。
export const queryClient = new QueryClient()
