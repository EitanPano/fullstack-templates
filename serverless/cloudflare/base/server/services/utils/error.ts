// error.ts belongs: the one error type controllers and gates throw, the closed set of error codes
// and the envelope an error becomes (the `ErrorBody` schema is the contract's one error shape). A
// handler never builds an HTTP error response itself; the root middleware does (see
// `AGENTS.md › Errors`). It does not belong: logging or the response (middleware/error-handler.ts).
import { z } from './zod'

export const ERROR_CODES = [
  'validation_failed',
  'unauthenticated',
  'forbidden',
  'not_found',
  'method_not_allowed',
  'conflict',
  'payload_too_large',
  'unsupported_media_type',
  'rate_limited',
  'internal',
  'upstream_unavailable',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

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

// The envelope every non-2xx response carries (see `AGENTS.md › Errors`).
export const ErrorBody = z
  .object({
    error: z.object({
      code: z.enum(ERROR_CODES),
      message: z.string(),
      details: z.unknown().optional(),
    }),
    requestId: z.string(),
  })
  .openapi('ErrorBody')

export type ErrorBody = z.infer<typeof ErrorBody>

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
