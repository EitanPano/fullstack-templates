import type { ErrorBody, ModulePage } from '@app/services/generated/types.gen'

// The envelope's `code` values come from the contract; the other three are ours: `network` (no
// response), `unknown` (a response that is not the envelope) and `validation` (a client-side check
// that failed before any request).
export type EnvelopeCode = ErrorBody['error']['code']
export type ApiErrorCode = EnvelopeCode | 'network' | 'unknown' | 'validation'

// The generated page envelope with the items typed by the caller: `Paginated<Module>`.
export type Paginated<T> = Omit<ModulePage, 'items'> & { items: T[] }
