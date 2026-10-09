// 同じブラウザの別のタブへ「ログインかログアウトがあった」と知らせる。
// リフレッシュ Cookie は全タブで共有されるが、アクセストークンはタブごとにメモリにある。
// 知らせないと、共用の端末でログアウトしたあとも、閉じ忘れた別のタブが最長 1 時間は前の人として動いてしまう
// 。受け取ったタブは、持っているものを捨てて取り直す。
export const AUTH_CHANNEL_NAME = 'raise-timeline-auth'

type AuthMessage = { type: 'auth-changed' }

// 購読者を Set に入れるときは、購読ごとに別の入れ物にする。
// 同じ関数を 2 回購読したときに、片方を外すともう片方まで外れるのを避けるため。
type Subscription = { listener: () => void }
const subscriptions = new Set<Subscription>()

// 送信と受信で同じチャンネルを使う（モジュールに 1 つだけ持つ）。
// BroadcastChannel は、送ったインスタンス自身には知らせを届けない。同じものを使えば、
// 自分の送信で自分の購読者が呼ばれることは無く、持ち方が 1 通りで済んで後始末も 1 か所になる。
let channel: BroadcastChannel | null = null

function supported(): boolean {
  return typeof BroadcastChannel !== 'undefined'
}

function isAuthChanged(data: unknown): data is AuthMessage {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'auth-changed'
}

function handleMessage(event: MessageEvent): void {
  if (!isAuthChanged(event.data)) return
  // 呼び出し中に購読が増減しても巻き込まれないよう、複製して回す。
  for (const subscription of [...subscriptions]) subscription.listener()
}

export function announceAuthChanged(): void {
  if (!supported()) return
  const message: AuthMessage = { type: 'auth-changed' }
  try {
    if (channel) {
      channel.postMessage(message)
      return
    }
    // 購読者が 1 つも居ないときは、一時的なチャンネルで送ってすぐ閉じる。
    // 開いたままにすると、閉じ時が無くなる。
    const temporary = new BroadcastChannel(AUTH_CHANNEL_NAME)
    try {
      temporary.postMessage(message)
    } finally {
      temporary.close()
    }
  } catch {
    // 知らせが送れなくても、この端末の操作は成功させる。受け損ねたタブは、更新で別の利用者が返ったときに気づく。
  }
}

export function onAuthChangedElsewhere(listener: () => void): () => void {
  if (!supported()) return () => {}
  const subscription: Subscription = { listener }
  try {
    if (!channel) {
      channel = new BroadcastChannel(AUTH_CHANNEL_NAME)
      channel.onmessage = handleMessage
    }
  } catch {
    return () => {}
  }
  subscriptions.add(subscription)
  return () => {
    subscriptions.delete(subscription)
    // 購読が 0 になったら閉じる。開いたままだと、アンマウントしたあともチャンネルが残る。
    if (subscriptions.size === 0 && channel) {
      channel.close()
      channel = null
    }
  }
}
