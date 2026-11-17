// constant.ts belongs: the copy table of the error envelope. Every code a response or the client
// can produce has one message here, and the server's own text is never shown. The record type
// fails the build when the contract gains a code that has no copy.
// It does not belong: the lookup (services/error-copy.ts).
import type { ApiErrorCode } from '../api/type'

export const ERROR_COPY: Record<ApiErrorCode, string> = {
  validation_failed: 'Check the form and try again.',
  unauthenticated: 'You need to sign in to do that.',
  forbidden: 'You do not have access to this.',
  not_found: 'We could not find that.',
  method_not_allowed: 'That action is not available here.',
  conflict: 'That conflicts with something that already exists.',
  payload_too_large: 'That is too large to send.',
  unsupported_media_type: 'That kind of content is not supported.',
  rate_limited: 'Too many attempts. Wait a few minutes and try again.',
  internal: 'Something went wrong on our side. Try again.',
  upstream_unavailable: 'The service is unavailable right now. Try again in a moment.',
  network: 'Cannot reach the server. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
  validation: 'Check the form and try again.',
}

// What a field shows when the server rejects it: never the server's text.
export const FIELD_ERROR_COPY = 'This value is not valid.'
