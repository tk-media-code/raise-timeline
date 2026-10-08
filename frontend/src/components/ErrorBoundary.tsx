import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { hasError: boolean }

// 描画中に投げられた例外を受け止め、白い画面の代わりに案内を出す（docs/features/auth.md、docs/error-handling-design.md）。
// 例外を捕まえる仕組み（getDerivedStateFromError）は、React 19 でもクラスコンポーネントにしか無い。
// イベントハンドラや非同期の中の例外は React の描画の外なので、ここでは捕まらない。
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 原因を調べられるよう、握りつぶさずにコンソールへ残す。
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 bg-white px-4 py-8 text-black">
        <h1 className="text-2xl font-bold">問題が起きました。再読み込みしてください</h1>
        <div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-md bg-sky-600 px-4 font-medium text-white hover:bg-sky-700 focus:outline-2 focus:outline-offset-2 focus:outline-sky-600"
          >
            再読み込み
          </button>
        </div>
      </main>
    )
  }
}
