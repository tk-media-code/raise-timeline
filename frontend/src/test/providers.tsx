import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import { useState, type ReactElement, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ToastProvider } from '../components/Toast'
import { createQueryClient } from '../lib/queryClient'

type TestProvidersProps = {
  children: ReactNode
  queryClient?: QueryClient
  route?: string
}

// ルートを持たない包み。自分で <Routes> を書きたいテスト（レイアウトルートの検査など）が使う。
// queryClient を渡さなければ、テストごとに新しいものを作る（別のテストのキャッシュを持ち越さない）。
// 再描画のたびに作り直すとキャッシュが消えるので、最初の 1 回だけ作って持つ。
export function TestProviders({ children, queryClient, route }: TestProvidersProps) {
  const [created] = useState(() => createQueryClient())
  const client = queryClient ?? created
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route ?? '/']}>{children}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

// 移動先が分かるように、どのルートにも合わない場所は「現在地: …」と出す。
function Location() {
  const { pathname, search } = useLocation()
  return (
    <p>
      現在地: {pathname}
      {search}
    </p>
  )
}

type Options = { route?: string; path?: string; queryClient?: QueryClient }

// 呼び出した側が queryClient を触れるよう、返り値に含める。
// oxlint-disable-next-line react/only-export-components
export function renderWithProviders(ui: ReactElement, options: Options = {}): RenderResult & { queryClient: QueryClient } {
  const queryClient = options.queryClient ?? createQueryClient()
  const result = render(
    <TestProviders queryClient={queryClient} route={options.route}>
      <Routes>
        <Route path={options.path ?? '/'} element={ui} />
        <Route path="*" element={<Location />} />
      </Routes>
    </TestProviders>,
  )
  return { ...result, queryClient }
}
