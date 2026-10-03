// defineConfigを'vite'ではなく'vitest/config'から取り込む。中身はViteのものを拡張した同じ関数で、
// 下のtestプロパティ（Vitestの設定）に型が付くようになる。
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Tailwind CSS v4 は PostCSS 設定ファイルを使わず、Viteプラグインとして組み込む方式。
  // src/index.css の `@import "tailwindcss";` はこのプラグインが解釈してコンパイルする。
  plugins: [react(), tailwindcss()],
  server: {
    // 既定値の localhost（127.0.0.1）だとコンテナ内部からしか listen を受け付けられない。
    // 0.0.0.0 で待ち受けることで、docker-compose.yml の ports 設定によるホストからの
    // ポートフォワード（http://localhost:5173）がコンテナに届くようにする。
    host: true,
    port: 5173,
  },
  test: {
    // Vitestは既定ではNode環境で動くため、documentもwindowも存在しない。
    // jsdom（JavaScriptで実装されたブラウザ相当のDOM）を使うことで、
    // React Testing Libraryがコンポーネントを実際に描画できるようになる。
    environment: 'jsdom',
    // 各テストファイルの実行前に読み込むファイル。マッチャーの追加と後片付けを行う。
    setupFiles: ['./src/test/setup.ts'],
    // describe/it/expectをグローバルにはせず、各テストで明示的にimportする方針。
    // どこから来た関数なのかがファイル単体で追え、oxlintのimportプラグインも効く。
    globals: false,
  },
})
