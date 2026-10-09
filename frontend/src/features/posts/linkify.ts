export type BodySegment = { kind: 'text'; text: string } | { kind: 'link'; url: string }

// http:// と https:// で始まる URL だけをリンクにする。javascript: や data: は拾わない。
// 文字の集合は ASCII だけ。全角の文字（。や日本語）は含めないので、そこで URL が終わる。
const URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g

// 文末の句読点は URL の一部ではないことが多いので外す。
const TRAILING_PUNCTUATION = /[.,;:!?'"\]]$/

function count(text: string, char: string): number {
  return text.split(char).length - 1
}

// 末尾の ) は、URL の中で ( より ) が多いときだけ外す。
// 必ず外すと Wikipedia の …/X_(Y) が壊れ、必ず残すと「(https://example.com)」の ) を巻き込む。
// 外すと別の規則に当たる並び（「).」など）があるので、末尾が変わらなくなるまで繰り返す。
function trimTrailing(url: string): string {
  let current = url
  for (;;) {
    let next = current
    if (TRAILING_PUNCTUATION.test(next)) {
      next = next.slice(0, -1)
    } else if (next.endsWith(')') && count(next, ')') > count(next, '(')) {
      next = next.slice(0, -1)
    }
    if (next === current) return current
    current = next
  }
}

// 本文を、文字とリンクの並びに分ける。HTML は組み立てない（React が文字を escape する）。
export function linkify(body: string): BodySegment[] {
  const segments: BodySegment[] = []
  let last = 0
  for (const match of body.matchAll(URL_RE)) {
    const url = trimTrailing(match[0])
    // 末尾を外した結果、スキームだけ（「https://.」など）になったものはリンクにしない。
    if (/^https?:\/\/$/.test(url)) continue
    if (match.index > last) segments.push({ kind: 'text', text: body.slice(last, match.index) })
    segments.push({ kind: 'link', url })
    last = match.index + url.length
  }
  if (last < body.length) segments.push({ kind: 'text', text: body.slice(last) })
  return segments
}
