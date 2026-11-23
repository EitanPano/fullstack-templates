import type { ApiErrorCode, Outcome } from './type'

// Every code the copy table (`errors.<code>` in en.json) has a message for. Typed as a record over
// `ApiErrorCode`, so a code added to the contract fails the build here until it is listed; a spec
// compares the keys with en.json.
// Beside a serverless API the contract also has method_not_allowed, which the Worker answers for // @server:serverless
// a method a path does not take. // @server:serverless
const CODES: Record<ApiErrorCode, true> = {
  validation_failed: true,
  unauthenticated: true,
  forbidden: true,
  not_found: true,
  method_not_allowed: true, // @server:serverless
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

// The outcome of a call that was not sent or was replaced by a newer one.
export const DROPPED: Outcome<never> = { ok: false, error: null }
