import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

// BrowserRouterでApp全体をラップすることで、配下のどのコンポーネントからでも
// <Link>やuseParams・useNavigateなどReact Routerのルーティング機能が使えるようになる。
// （ブラウザのURL変更をHistory APIで検知し、ページ全体を再読み込みせずに表示を切り替える仕組み）
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
