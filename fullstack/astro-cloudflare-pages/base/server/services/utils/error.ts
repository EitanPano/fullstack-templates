// error.ts belongs: the one error type controllers and gates throw, and the envelope it becomes.
// A handler never builds an HTTP error response itself; the root middleware does (see
// `AGENTS.md › Errors`). It does not belong: logging or the response (middleware/error-handler.ts).
import type { ErrorBody, ErrorCode } from '@shared/types/api'

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  internal: 500,
  upstream_unavailable: 503,
}

// `headers` are applied to the response by the error handler.
export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details: unknown
  readonly headers: Readonly<Record<string, string>> | undefined

  constructor(
    code: ErrorCode,
    message: string,
    details?: unknown,
    options?: { headers?: Record<string, string> },
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.details = details
    this.headers = options?.headers
  }
}

// The one 401 a session refresh can fix: the request carries no valid access token. Any other
// 401 (wrong credentials, invalid refresh token, invalid code) is built without this challenge.
export const BEARER_CHALLENGE = 'Bearer'

export function authenticationRequired(): AppError {
  return new AppError('unauthenticated', 'authentication required', undefined, {
    headers: { 'WWW-Authenticate': BEARER_CHALLENGE },
  })
}

export function toErrorBody(error: AppError, requestId: string): ErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
    requestId,
  }
}
