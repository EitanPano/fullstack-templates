import type { ErrorBody } from '@/services/generated/types.gen'

// What a failed call looks like to the UI. A plain object, not an Error subclass: RTK Query keeps
// a failed query's error in the Redux state, and the serializability check refuses class
// instances. `message` is copy we wrote, never the server's text.
export type ErrorCode = ErrorBody['error']['code']

export type ApiError = {
  code: ErrorCode | 'network'
  status?: number
  message: string
  // Maps a form field path to its message when the failure belongs to a field.
  fieldErrors?: Record<string, string>
  requestId?: string
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof value.code === 'string' &&
    'message' in value &&
    typeof value.message === 'string'
  )
}
