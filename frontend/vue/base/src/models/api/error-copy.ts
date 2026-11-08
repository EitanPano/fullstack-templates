import type { ApiErrorCode } from './response'

// Every code the copy table (`errors.<code>` in en.json) has a message for. Typed as a record over
// `ApiErrorCode`, so a code added to the contract fails the build here until it is listed; a spec
// checks the table against en.json.
const CODES: Record<ApiErrorCode, true> = {
  validation_failed: true,
  unauthenticated: true,
  forbidden: true,
  not_found: true,
  conflict: true,
  payload_too_large: true,
  unsupported_media_type: true,
  rate_limited: true,
  internal: true,
  upstream_unavailable: true,
  network: true,
  unknown: true,
  validation: true,
}

export const ERROR_CODES = Object.keys(CODES) as ApiErrorCode[]

// The copy-table key for an error code: `errors.<code>`, or `errors.unknown` for any other string.
export function errorMessageKey(code: string): string {
  return Object.hasOwn(CODES, code) ? `errors.${code}` : 'errors.unknown'
}
