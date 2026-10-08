// アクセストークンはメモリだけに置く。localStorage に入れると XSS で盗まれる（docs/auth-design.md）。
// 画面を読み直すと消えるが、そのときはリフレッシュ Cookie で取り直す。
// React の状態にしないのは、API クライアント（React の外の関数）から同期で読むため。
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}
