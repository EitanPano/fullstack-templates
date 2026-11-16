// api.ts belongs: the types of the HTTP contract both halves read: the error codes, the error
// envelope every non-2xx response carries, and the page shape of a list. Plain TypeScript, no
// imports. It does not belong: a module's own schemas (shared/schemas/<module>.ts).
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

export type ErrorBody = {
  error: { code: ErrorCode; message: string; details?: unknown }
  requestId: string
}

export type Page<T> = { items: T[]; nextCursor: string | null }
