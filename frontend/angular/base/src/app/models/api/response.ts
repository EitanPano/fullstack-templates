import type { ErrorBody, ModulePage } from '@app/services/generated/types.gen'

// The envelope's `code` values come from the contract; the other three are ours: `network` (no
// response), `unknown` (a response that is not the envelope) and `validation` (a client-side check
// that failed before any request).
export type EnvelopeCode = ErrorBody['error']['code']
export type ApiErrorCode = EnvelopeCode | 'network' | 'unknown' | 'validation'

export interface ApiErrorInit {
  readonly status: number
  readonly code: ApiErrorCode
  readonly requestId?: string | null
  readonly fieldErrors?: Record<string, string[]>
}

// What a failed call rejects with. The error interceptor builds it from the HTTP error; the server's
// own `message` is never kept, because the UI shows copy from its own table (`errors.<code>`).
// `fieldErrors` maps a field path to the codes that failed (a code is a key of the copy table).
export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly requestId: string | null
  readonly fieldErrors?: Record<string, string[]>

  constructor(init: ApiErrorInit) {
    super(`${init.code} (${String(init.status)})`)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.requestId = init.requestId ?? null
    if (init.fieldErrors) this.fieldErrors = init.fieldErrors
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

// The generated page envelope with the items typed by the caller: `Paginated<Module>`.
export type Paginated<T> = Omit<ModulePage, 'items'> & { items: T[] }
