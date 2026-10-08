import { refreshSession } from '../auth/refresh'
import { getAccessToken } from '../auth/tokenStore'

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

  let encodedBody: string | undefined
  if (body !== undefined) {
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
  const response = await send(path, init)
  if (response.ok) return readBody<T>(response)

  const error = await toApiError(response)
  if (response.status === 401 && error.code === 'UNAUTHENTICATED' && init.retryOn401 !== false) {
    // 更新は 1 本にまとまっているので、同時に何本が 401 になっても更新の要求は 1 回で済む。
    const session = await refreshSession()
    if (session) {
      // やり直しは 1 回だけ。ここで 401 なら更新を繰り返さず、そのまま投げる。
      const retried = await send(path, init)
      if (retried.ok) return readBody<T>(retried)
      throw await toApiError(retried)
    }
  }
  throw error
}
