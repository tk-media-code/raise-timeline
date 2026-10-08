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

// セッションの世代。signIn・signOut のたびに進める。
// 進行中の更新が終わったとき、始めた時と世代が違えば、その結果はもう古い。
// 古い結果でトークンを書き換えたり消したりすると、直後にログインした人やログアウトした人の状態を壊す。
let sessionGeneration = 0

export function getSessionGeneration(): number {
  return sessionGeneration
}

export function advanceSessionGeneration(): void {
  sessionGeneration += 1
}
