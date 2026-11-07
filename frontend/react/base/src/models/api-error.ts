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
  // The envelope's `error.details`, raw, so a product's `discriminator` can read it. Serialisable.
  details?: unknown
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

// A feature's copy table: `code`, `code:second-key` when the product's contract adds a
// discriminator (see `WithCopyOptions`), or `validation_failed:<field>` for one field of a form.
export type CopyTable = Partial<Record<string, string>>

export type WithCopyOptions = {
  // Codes that belong to one field of the form: `{ conflict: 'email' }`.
  fields?: Partial<Record<ErrorCode, string>>
  // A second key into the table, read from the error (usually from `details`).
  discriminator?: (error: ApiError) => string | undefined
}

// Words an error in a feature's own copy; this is the one home of error copy beyond the defaults
// in `services/call.ts`. The feature that shows the error knows its situation (a wrong password,
// a taken email), so it applies its table here and says which codes belong to a form field. Pure:
// the error it is given is not changed.
export function withCopy(
  error: ApiError,
  copy: CopyTable,
  { fields = {}, discriminator }: WithCopyOptions = {},
): ApiError {
  const second = discriminator?.(error)
  const message =
    (second === undefined ? undefined : copy[`${error.code}:${second}`]) ??
    copy[error.code] ??
    error.message
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
