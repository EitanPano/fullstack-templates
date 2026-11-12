import type { ErrorBody, ModulePage } from '@app/services/generated/types.gen'

import type { ApiFailure } from './interface'

// The envelope's `code` values come from the contract; the other three are ours: `network` (no
// response), `unknown` (a response that is not the envelope) and `validation` (a client-side check
// that failed before any request).
export type EnvelopeCode = ErrorBody['error']['code']
export type ApiErrorCode = EnvelopeCode | 'network' | 'unknown' | 'validation'

// The generated page envelope with the items typed by the caller: `Paginated<Module>`.
export type Paginated<T> = Omit<ModulePage, 'items'> & { items: T[] }

// What a store method that calls the API resolves to; it never rejects. `error: null` means there
// is nothing for the caller to show: the call was not sent (offline, a form still pending) or a
// newer call of the same name replaced it.
export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApiFailure | null }
