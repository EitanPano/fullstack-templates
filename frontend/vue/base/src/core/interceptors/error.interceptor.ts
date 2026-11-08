import { ERROR_CODES } from '@/models/api/error-copy'
import { isApiError, type ApiError, type ApiErrorCode } from '@/models/api/response'

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
// The codes the envelope may carry; the other three are ours.
const ENVELOPE_CODES: ReadonlySet<string> = new Set(
  ERROR_CODES.filter((code) => code !== 'network' && code !== 'unknown' && code !== 'validation'),
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// The paths of a validation envelope's `details` (`[{ path, message }]`). The server's message is
// dropped: the field shows our `errors.invalid` copy.
function fieldErrorsOf(details: unknown): Record<string, string[]> | undefined {
  if (!Array.isArray(details)) return undefined
  const entries = (details as unknown[]).flatMap((detail) => {
    const path = isRecord(detail) ? detail['path'] : undefined
    const safe =
      typeof path === 'string' &&
      path !== '' &&
      path.split('.').every((key) => key !== '' && !UNSAFE_KEYS.has(key))
    return safe ? [[path, ['invalid']] as [string, string[]]] : []
  })
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

// The generated client's error interceptor (registered by http.provider.ts): the parsed body of a
// failed response, or what a thrown fetch threw, becomes the ApiError a facade call rejects with.
// The server's `message` and `details` are dropped; the UI words errors from its own copy table.
export function errorInterceptor(error: unknown, response: Response | undefined): ApiError {
  if (response === undefined) {
    if (isApiError(error)) return error
    return error instanceof TypeError ? { code: 'network' } : { code: 'unknown' }
  }

  const status = response.status
  const headerId = response.headers.get('x-request-id') ?? undefined
  const envelope = isRecord(error) ? error['error'] : undefined
  const code = isRecord(envelope) ? envelope['code'] : undefined
  if (!isRecord(error) || !isRecord(envelope) || typeof code !== 'string') {
    return { code: 'unknown', status, ...(headerId !== undefined ? { requestId: headerId } : {}) }
  }

  const known = ENVELOPE_CODES.has(code)
  const fromBody = error['requestId']
  const requestId = typeof fromBody === 'string' ? fromBody : headerId
  const fieldErrors = code === 'validation_failed' ? fieldErrorsOf(envelope['details']) : undefined
  return {
    code: known ? (code as ApiErrorCode) : 'unknown',
    status,
    ...(requestId !== undefined ? { requestId } : {}),
    ...(fieldErrors ? { fieldErrors } : {}),
  }
}
