import { useSyncExternalStore } from 'react'

const TICK_MS = 60_000

// 画面全体で 1 本のタイマーを共有する。投稿やコメントの数だけタイマーを作らない。
// 見ている部品が 1 つでもある間だけ動かし、0 になったら止める。
let current = new Date()
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function tick() {
  current = new Date()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (timer === null) {
    // 誰も見ていなかった間に時間がたっている。動かし始める時点の時刻にそろえる。
    current = new Date()
    timer = setInterval(tick, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

// 次のタイマーまで同じ Date を返す。描くたびに新しい Date を返すと、useSyncExternalStore が値の変化とみなして描き直し続ける。
function getSnapshot() {
  // 誰も見ていない間は tick が動かず、current が古いままになる。使い始めの最初の描画が古い時刻にならないよう、
  // 古ければ取り直す。1 秒以内に取り直した値は変えないので、同じ描画の中で値が揺れることはない。
  if (timer === null && Date.now() - current.getTime() >= 1000) current = new Date()
  return current
}

// 1 分ごとに進む「今」。相対時刻（「3 分前」）を、描き直されなくても進めるために使う。
export function useNow(): Date {
  return useSyncExternalStore(subscribe, getSnapshot)
}
