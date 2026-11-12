import type { ApiErrorInit, ApiFailure } from '@app/models/api/interface'
import type { ApiErrorCode } from '@app/models/api/type'

// What a failed call rejects with. The error interceptor builds it from the HTTP error; the server's
// own `message` is never kept, because the UI shows copy from its own table (`errors.<code>`).
// `fieldErrors` maps a field path to the codes that failed (a code is a key of the copy table).
export class ApiError extends Error implements ApiFailure {
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
