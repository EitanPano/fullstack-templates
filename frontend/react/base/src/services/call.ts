import type { ApiError, ErrorCode } from '@/models/api-error'
import type { ErrorBody } from '@/services/generated/types.gen'

// `call` is how an endpoint reads the generated client's result: `{ data }` on success, `{ error }`
// on failure, which is RTK Query's `queryFn` contract. The message is copy we wrote, looked up by
// the envelope's `code`, never the server's text. The cause (status, code, request id) is logged
// and goes no further.

export const DEFAULT_COPY: Record<ErrorCode | 'network', string> = {
  validation_failed: 'Check the form and try again.',
  unauthenticated: 'Your session has expired. Sign in again.',
  forbidden: "You don't have access to this.",
  not_found: "We couldn't find that.",
  conflict: 'That conflicts with something that already exists.',
  payload_too_large: 'That is too large to send.',
  unsupported_media_type: "That kind of file isn't supported.",
  rate_limited: 'Too many attempts. Wait a few minutes and try again.',
  internal: 'Something went wrong on our side. Try again.',
  upstream_unavailable: 'The service is unavailable right now. Try again in a moment.',
  network: "Can't reach the server. Check your connection and try again.",
}

// What the generated client resolves to: a success branch (error undefined) or an error branch.
type ApiResult = { data?: unknown; error?: unknown; response?: Response }
type Data<R> = R extends { error?: undefined; data: infer D } ? D : never

export type CallResult<R extends ApiResult> = { data: Data<R> } | { error: ApiError }

const CODES = new Set<string>(Object.keys(DEFAULT_COPY))

function isEnvelope(value: unknown): value is ErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  const { error } = value
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    CODES.has(error.code)
  )
}

function codeForStatus(status: number): ErrorCode {
  if (status === 400) return 'validation_failed'
  if (status === 401) return 'unauthenticated'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 413) return 'payload_too_large'
  if (status === 415) return 'unsupported_media_type'
  if (status === 429) return 'rate_limited'
  if (status === 502 || status === 503 || status === 504) return 'upstream_unavailable'
  return 'internal'
}

// A path comes from the server's body. Keys that reach the prototype chain are never used as
// object keys, so a hostile or buggy body cannot change the errors object's prototype.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const safePath = (path: string) =>
  path.split('.').every((key) => key !== '' && !UNSAFE_KEYS.has(key))

function detailPaths(body: ErrorBody | undefined): string[] {
  const details = body?.error.details
  if (!Array.isArray(details)) return []
  return details.flatMap((entry: unknown) =>
    typeof entry === 'object' &&
    entry !== null &&
    'path' in entry &&
    typeof entry.path === 'string' &&
    entry.path !== ''
      ? [entry.path].filter(safePath)
      : [],
  )
}

const unreachable = (): { error: ApiError } => ({
  error: { code: 'network', message: DEFAULT_COPY.network },
})

export async function call<R extends ApiResult>(request: Promise<R>): Promise<CallResult<R>> {
  let result: R
  try {
    result = await request
  } catch (cause) {
    console.error('[api] request failed', { cause })
    return unreachable()
  }

  const { response } = result
  // No response: the client returned the thrown value as `error`. Decide this before trusting
  // the error's declared type.
  if (response === undefined) {
    console.error('[api] unreachable', { cause: result.error })
    return unreachable()
  }
  if (response.ok) return { data: result.data as Data<R> }

  const body = isEnvelope(result.error) ? result.error : undefined
  const code = body?.error.code ?? codeForStatus(response.status)
  if (response.status >= 500 || body === undefined) {
    console.error('[api] error response', {
      requestId: body?.requestId,
      status: response.status,
      code,
    })
  }

  const message = DEFAULT_COPY[code]
  // A 400's details name the fields; the feature words them (`withCopy`), here they carry the
  // default copy.
  const fieldErrors = new Map<string, string>()
  if (code === 'validation_failed') {
    for (const path of detailPaths(body)) fieldErrors.set(path, message)
  }

  return {
    error: {
      code,
      status: response.status,
      message,
      ...(fieldErrors.size > 0 ? { fieldErrors: Object.fromEntries(fieldErrors) } : {}),
      ...(body === undefined ? {} : { requestId: body.requestId }),
      ...(body?.error.details === undefined ? {} : { details: body.error.details }),
    },
  }
}
