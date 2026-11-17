// api.ts belongs: the one wrapper over the generated client. It turns every failure into an
// ApiError (the envelope's code, the status and the request id; the server's text is dropped) and
// returns the body of a success. An entity's service (services/<entity>.ts) calls a generated SDK
// function through `request`; the response is typed by the contract, never by a hand-written type.
// It does not belong: an entity's calls, the words of an error (services/error-copy.ts) or any UI.
import type { ApiError, ApiErrorCode } from '../models/api/type'
import { ERROR_COPY } from '../models/error/constant'
import { client } from './generated/client.gen'

// The codes the page itself produces; any other key of the copy table is the envelope's.
const CLIENT_CODES: readonly string[] = ['network', 'unknown', 'validation']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isEnvelopeCode(code: unknown): code is ApiErrorCode {
  return typeof code === 'string' && Object.hasOwn(ERROR_COPY, code) && !CLIENT_CODES.includes(code)
}

// The paths of a validation envelope's `details` (`[{ path, message }]`); the messages are dropped.
function fieldPathsOf(details: unknown): string[] {
  if (!Array.isArray(details)) return []
  return (details as unknown[]).flatMap((detail) => {
    const path = isRecord(detail) ? detail['path'] : undefined
    return typeof path === 'string' && path !== '' ? [path] : []
  })
}

export function isApiError(value: unknown): value is ApiError {
  return (
    isRecord(value) && typeof value['code'] === 'string' && Object.hasOwn(ERROR_COPY, value['code'])
  )
}

// The generated client's error interceptor: the parsed body of a failed response, or what a thrown
// fetch threw, becomes the ApiError a call rejects with.
export function errorInterceptor(error: unknown, response: Response | undefined): ApiError {
  if (response === undefined) {
    if (isApiError(error)) return error
    return { code: error instanceof TypeError ? 'network' : 'unknown' }
  }
  const status = response.status
  const headerId = response.headers.get('x-request-id') ?? undefined
  const envelope = isRecord(error) ? error['error'] : undefined
  const code = isRecord(envelope) ? envelope['code'] : undefined
  if (!isRecord(error) || !isRecord(envelope) || !isEnvelopeCode(code)) {
    return { code: 'unknown', status, ...(headerId === undefined ? {} : { requestId: headerId }) }
  }
  const fromBody = error['requestId']
  const requestId = typeof fromBody === 'string' ? fromBody : headerId
  const fieldPaths = code === 'validation_failed' ? fieldPathsOf(envelope['details']) : []
  return {
    code,
    status,
    ...(requestId === undefined ? {} : { requestId }),
    ...(fieldPaths.length > 0 ? { fieldPaths } : {}),
  }
}

// Registered once, when the module loads; a second load changes nothing.
if (!client.interceptors.error.exists(errorInterceptor)) {
  client.interceptors.error.use(errorInterceptor)
}

// The belt for a handler that awaited a call: an ApiError passes, a thrown fetch is a network
// failure, anything else is unknown.
export function toApiError(cause: unknown): ApiError {
  if (isApiError(cause)) return cause
  return { code: cause instanceof TypeError ? 'network' : 'unknown' }
}

// Runs one generated SDK call, `request(() => getApiHealth({ throwOnError: true }))`, and returns
// its body; a failure rejects with an ApiError.
export async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data
  } catch (cause) {
    throw toApiError(cause)
  }
}
