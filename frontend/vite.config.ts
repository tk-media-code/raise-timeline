// defineConfigを'vite'ではなく'vitest/config'から取り込む。中身はViteのものを拡張した同じ関数で、
// 下のtestプロパティ（Vitestの設定）に型が付くようになる。
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 既定値の localhost（127.0.0.1）だとコンテナ内部からしか listen を受け付けられない。
    // 0.0.0.0 で待ち受けることで、docker-compose.yml の ports 設定によるホストからの
    // ポートフォワード（http://localhost:5173）がコンテナに届くようにする。
    host: true,
    port: 5173,
    proxy: {
      // コンテナ名で backend へ転送する。ブラウザからは同じオリジン（5173）への呼び出しに見えるので、
      // CORS の設定が要らず、SameSite=Lax の Cookie もそのまま送られる。
      '/api': { target: 'http://backend:8080', changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // describe/it/expectをグローバルにはせず、各テストで明示的にimportする方針。
    // どこから来た関数なのかがファイル単体で追え、oxlintのimportプラグインも効く。
    globals: false,
  },
})
