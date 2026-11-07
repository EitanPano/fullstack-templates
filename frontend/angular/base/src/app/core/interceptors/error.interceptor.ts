import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http'
import { catchError, throwError } from 'rxjs'

import { ERROR_CODES } from '@app/models/api/error-copy'
import { ApiError, type ApiErrorCode } from '@app/models/api/response'

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
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

// Turns the HTTP failure into the app's error. No response (status 0) is `network`; a body that is
// not the server's envelope, or carries a code we have no copy for, is `unknown`. The envelope's
// `message` is never read: the UI shows copy from its own table.
export function toApiError(response: HttpErrorResponse): ApiError {
  const requestId = response.headers.get('x-request-id')
  if (response.status === 0) return new ApiError({ status: 0, code: 'network', requestId })

  const body: unknown = response.error
  const envelope = isRecord(body) ? body['error'] : undefined
  const code = isRecord(envelope) ? envelope['code'] : undefined
  if (!isRecord(body) || !isRecord(envelope) || typeof code !== 'string') {
    return new ApiError({ status: response.status, code: 'unknown', requestId })
  }
  const fromBody = body['requestId']
  const known = ENVELOPE_CODES.has(code)
  const fieldErrors = code === 'validation_failed' ? fieldErrorsOf(envelope['details']) : undefined
  return new ApiError({
    status: response.status,
    code: known ? (code as ApiErrorCode) : 'unknown',
    requestId: typeof fromBody === 'string' ? fromBody : requestId,
    ...(fieldErrors ? { fieldErrors } : {}),
  })
}

// Maps an HttpErrorResponse to an ApiError and rethrows it; it shows nothing (the awaiting store
// method or page does). It sits inside the loading interceptor and outside the auth interceptor,
// so auth sees the raw 401 and this mapper sees the final error.
export const errorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((error: unknown) =>
      throwError(() => (error instanceof HttpErrorResponse ? toApiError(error) : error)),
    ),
  )
