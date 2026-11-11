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

// A page's copy table: `code`, `code:second-key` when the product's contract adds a
// discriminator (see `WithCopyOptions`), or `validation_failed:<field>` for one field of a form.
export type CopyTable = Partial<Record<string, string>>

export type WithCopyOptions = {
  // Codes that belong to one field of the form: `{ conflict: 'email' }`.
  fields?: Partial<Record<ErrorCode, string>>
  // A second key into the table, read from the error (usually from `details`).
  discriminator?: (error: ApiError) => string | undefined
}
