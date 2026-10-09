import { refreshSession } from '../auth/refresh'
import { getAccessToken, getSessionGeneration, getSessionUserId } from '../auth/tokenStore'

export type FieldError = { field: string; message: string }

// 本文が Problem Details でないとき（nginx の 429、通信失敗）に使う文言。
const FALLBACK_DETAIL = '通信に失敗しました'

type ApiErrorInit = {
  status: number
  code: string | null
  detail: string
  errors: FieldError[]
  requestId: string | null
}

// erasableSyntaxOnly のため、TS のパラメータプロパティは使わず、フィールドを明示して代入する。
export class ApiError extends Error {
  status: number
  // 本文が Problem Details でないときは null。画面は status だけで判断する。
  code: string | null
  detail: string
  errors: FieldError[]
  requestId: string | null

  constructor(init: ApiErrorInit) {
    super(init.detail)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.detail = init.detail
    this.errors = init.errors
    this.requestId = init.requestId
  }
}

// ID が UUID でない・ユーザー名が規則に合わない（400）も、対象が無い（404）も、打ち間違えた人にとっては「無い」。
// 詳細系の画面はどちらも「見つかりません」にそろえる。
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 400 || error.status === 404)
}

export type ApiFetchInit = Omit<RequestInit, 'body'> & {
  body?: unknown
  // false なら Bearer を付けない。
  auth?: boolean
  // false なら 401 UNAUTHENTICATED でも更新してやり直さない。
  retryOn401?: boolean
}

// 利用者に見せる文言。500 だけ requestId を全桁添える。
// 利用者がこの ID を伝えれば、その 1 件を本番のログから完全一致で引ける（docs/logging-design.md 6 章）。
export function formatErrorMessage(error: ApiError): string {
  if (error.status === 500 && error.requestId) {
    return `${error.detail}（ID: ${error.requestId}）`
  }
  return error.detail
}

// 422 の errors を、入力欄に結べる分と、フォームの上部に出す文言に振り分ける。
// errors が空か、欄に結べない field を含むときは、欄の下だけでは利用者に伝わらないので formMessage を返す。
export function splitFieldErrors<F extends string>(
  error: ApiError,
  isField: (field: string) => field is F,
): { fieldErrors: Partial<Record<F, string>>; formMessage: string | null } {
  const fieldErrors: Partial<Record<F, string>> = {}
  let unmatched = false
  for (const { field, message } of error.errors) {
    if (isField(field)) fieldErrors[field] = message
    else unmatched = true
  }
  const formMessage = error.errors.length === 0 || unmatched ? formatErrorMessage(error) : null
  return { fieldErrors, formMessage }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toFieldErrors(value: unknown): FieldError[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) =>
    isRecord(item) && typeof item.field === 'string' && typeof item.message === 'string'
      ? [{ field: item.field, message: item.message }]
      : [],
  )
}

async function toApiError(response: Response): Promise<ApiError> {
  const headerRequestId = response.headers.get('X-Request-Id')
  const contentType = response.headers.get('Content-Type') ?? ''

  if (contentType.includes('application/problem+json')) {
    try {
      const body: unknown = await response.json()
      if (isRecord(body)) {
        return new ApiError({
          status: response.status,
          code: typeof body.code === 'string' ? body.code : null,
          detail: typeof body.detail === 'string' ? body.detail : FALLBACK_DETAIL,
          errors: toFieldErrors(body.errors),
          requestId: typeof body.requestId === 'string' ? body.requestId : headerRequestId,
        })
      }
    } catch {
      // 壊れた JSON は、下の「Problem Details でない応答」と同じ扱いにする。
    }
  }

  return new ApiError({
    status: response.status,
    code: null,
    detail: FALLBACK_DETAIL,
    errors: [],
    requestId: headerRequestId,
  })
}

async function send(path: string, init: ApiFetchInit): Promise<Response> {
  const { body, auth, retryOn401: _retryOn401, headers: initHeaders, ...rest } = init
  const headers = new Headers(initHeaders)

  if (auth !== false) {
    const token = getAccessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  let encodedBody: string | FormData | undefined
  if (body instanceof FormData) {
    // そのまま送る。Content-Type は付けない（ブラウザが boundary 付きで決める）。
    // 401 のあとのやり直しでも同じオブジェクトを送る。FormData は何度でも送れる。
    encodedBody = body
  } else if (body !== undefined) {
    encodedBody = JSON.stringify(body)
    headers.set('Content-Type', 'application/json')
  }

  try {
    return await fetch(path, { ...rest, headers, body: encodedBody, credentials: 'same-origin' })
  } catch {
    // 応答が無い（オフライン、接続拒否）。画面は status 0 を通信失敗として扱う。
    throw new ApiError({ status: 0, code: null, detail: FALLBACK_DETAIL, errors: [], requestId: null })
  }
}

async function readBody<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  // 要求を送る時点の世代と利用者を控える。401 のあとの更新とやり直しが、
  // 「この要求を送った人」のままで行われるかを確かめるため。
  // 送ってから応答が来るまでの間に、他のタブの知らせでの取り直しや、別の利用者の食い違いの検出があると、
  // 世代が進み、利用者 id も変わる。そのあとに更新すると、別の人のセッションが返ってきて、
  // 元の人の要求が別の人のトークンでやり直されてしまう。
  const generation = getSessionGeneration()
  const userId = getSessionUserId()

  const response = await send(path, init)
  if (response.ok) return readBody<T>(response)

  const error = await toApiError(response)
  if (response.status === 401 && error.code === 'UNAUTHENTICATED' && init.retryOn401 !== false) {
    // 更新もやり直しもせず、元の 401 を投げる場合:
    // - 利用者 id が無い: このタブはログインしていない。起動時と取り直しの更新は AuthProvider が自分で呼ぶので、
    //   ここからは更新しない（更新すると、無関係な人のセッションを受け入れてしまう）。
    // - 世代が進んだ: 送ったあとに signIn・signOut・取り直し・利用者の食い違いがあった。
    if (userId === null || getSessionGeneration() !== generation) throw error
    // 更新は 1 本にまとまっているので、同時に何本が 401 になっても更新の要求は 1 回で済む。
    const session = await refreshSession()
    // 更新から戻ったあとも、世代が同じで、返った利用者が送った人と同じときだけやり直す。
    // 更新の側の食い違いの検査は、タブが利用者 id を覚えているときにしか効かない。
    // 別の要求の更新が 401 で終わって id を忘れたあと、Cookie が別の人のものに変わってから、この要求が
    // 新しく更新を始めると、更新は別の人をそのまま受け入れて返す。ここで見比べないと、
    // 送った人の要求が別の人のトークンでやり直されてしまう。違えば元の 401 を投げる。
    if (session && getSessionGeneration() === generation && session.user.id === userId) {
      // やり直しは 1 回だけ。ここで 401 なら更新を繰り返さず、そのまま投げる。
      const retried = await send(path, init)
      if (retried.ok) return readBody<T>(retried)
      throw await toApiError(retried)
    }
  }
  throw error
}
