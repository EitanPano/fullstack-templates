// api.ts belongs: the one fetch wrapper of the pages. It calls a relative /api path on the page's
// own origin (no URL is compiled in, no CORS), sends and reads JSON, turns every failure into an
// ApiError and parses every success body with the shared schema it is given: the response is
// always parsed, in development and in production, so a contract drift fails where it happens.
// It does not belong: an entity's calls (a services/<entity>.ts built on request) or any UI.
import { ERROR_CODES } from '@shared/types/api'

import type { ApiErrorCode } from '../models/api/type'
import { parse, type Output, type Schema } from './validation'

// What a failed call looks like to a page. `message` is the code, never the server's text: the
// page words an error through services/error-copy.ts. `requestId` is kept for support.
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number | undefined
  readonly requestId: string | undefined
  // The form fields a validation_failed envelope names, by path.
  readonly fieldPaths: readonly string[]

  constructor(
    code: ApiErrorCode,
    details: { status?: number; requestId?: string; fieldPaths?: readonly string[] } = {},
  ) {
    super(code)
    this.name = 'ApiError'
    this.code = code
    this.status = details.status
    this.requestId = details.requestId
    this.fieldPaths = details.fieldPaths ?? []
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

// The belt for a handler that awaited a call: an ApiError passes, a thrown fetch is a network
// failure, anything else is unknown.
export function toApiError(cause: unknown): ApiError {
  if (isApiError(cause)) return cause
  return new ApiError(cause instanceof TypeError ? 'network' : 'unknown')
}

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
export type CallOptions = {
  method?: Method
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  signal?: AbortSignal
}

function urlOf(path: string, query: CallOptions['query']): string {
  if (!path.startsWith('/api/')) {
    throw new Error(`api: "${path}" is not a relative /api path; the pages call their own origin`)
  }
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) search.set(key, String(value))
  }
  const text = search.toString()
  return text === '' ? path : `${path}?${text}`
}

async function fetchResponse(path: string, options: CallOptions): Promise<Response> {
  const headers = new Headers({ accept: 'application/json' })
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    credentials: 'same-origin',
  }
  if (options.signal) init.signal = options.signal
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json')
    init.body = JSON.stringify(options.body)
  }
  const url = urlOf(path, options.query)
  try {
    return await fetch(url, init)
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') throw cause
    throw new ApiError('network')
  }
}

function isCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value)
}

async function failureOf(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => undefined)
  const envelope =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const error = typeof envelope.error === 'object' && envelope.error !== null ? envelope.error : {}
  const { code, details } = error as { code?: unknown; details?: unknown }
  const requestId =
    typeof envelope.requestId === 'string'
      ? envelope.requestId
      : (response.headers.get('x-request-id') ?? undefined)
  const fieldPaths =
    code === 'validation_failed' && Array.isArray(details)
      ? details.flatMap((item: unknown) => {
          const path = (item as { path?: unknown } | null)?.path
          return typeof path === 'string' && path !== '' ? [path] : []
        })
      : []
  const known = isCode(code)
  return new ApiError(known ? code : 'unknown', {
    status: response.status,
    ...(requestId === undefined ? {} : { requestId }),
    fieldPaths: known ? fieldPaths : [],
  })
}

// A call that answers a body: it is parsed with `response`, the shared schema of the endpoint.
export async function request<S extends Schema>(
  path: string,
  options: CallOptions & { response: S },
): Promise<Output<S>> {
  const response = await fetchResponse(path, options)
  if (!response.ok) throw await failureOf(response)
  const result = parse(options.response, await response.json().catch(() => undefined))
  if (!result.success) {
    throw new ApiError('unknown', {
      status: response.status,
      ...(response.headers.has('x-request-id')
        ? { requestId: response.headers.get('x-request-id') as string }
        : {}),
    })
  }
  return result.data
}

// A call that answers no body (a 204).
export async function send(path: string, options: CallOptions = {}): Promise<void> {
  const response = await fetchResponse(path, options)
  if (!response.ok) throw await failureOf(response)
}
