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

// A feature's copy table: `code`, or `validation_failed:<field>` for one field of a form.
export type CopyTable = Partial<Record<string, string>>

// Words an error in a feature's own copy. The data layer returns the default copy; the feature
// that shows the error knows its situation (a wrong password, a taken email), so it applies its
// table here and says which codes belong to a form field (`{ conflict: 'email' }`). Pure: the
// error it is given is not changed.
export function withCopy(
  error: ApiError,
  copy: CopyTable,
  fields: Partial<Record<ErrorCode, string>> = {},
): ApiError {
  const message = copy[error.code] ?? error.message
  const fieldErrors = new Map(
    Object.entries(error.fieldErrors ?? {}).map(([path, text]) => [
      path,
      copy[`${error.code}:${path}`] ?? copy[error.code] ?? text,
    ]),
  )
  const field = error.code === 'network' ? undefined : fields[error.code]
  if (field !== undefined) fieldErrors.set(field, message)
  return {
    ...error,
    message,
    ...(fieldErrors.size > 0 ? { fieldErrors: Object.fromEntries(fieldErrors) } : {}),
  }
}
