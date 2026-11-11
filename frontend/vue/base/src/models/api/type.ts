import type { ErrorBody } from '@/services/generated/types.gen'

// What a failed call looks like to the UI. A plain object, not an Error subclass, so it can sit in
// a store's state. It carries no text of the server's: the UI words an error from `code` through
// its copy table.
export type ErrorCode = ErrorBody['error']['code']

// `network` is no response, `unknown` a response that is not the envelope, `validation` a client
// side check that failed before any request.
export type ApiErrorCode = ErrorCode | 'network' | 'unknown' | 'validation'

export type ApiError = {
  code: ApiErrorCode
  status?: number
  requestId?: string
  // Maps a form field path to the codes that failed for it.
  fieldErrors?: Record<string, readonly string[]>
  // Where a cause that was no ApiError came from (the store method), for logs; never shown.
  context?: string
}

export type Paginated<T> = {
  items: readonly T[]
  total: number
}
