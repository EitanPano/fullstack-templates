// type.ts belongs: what a failed call looks like to a page. The envelope's codes come from the
// generated contract types; the three below are the page's own (no response, a response that is
// not the envelope, a check that failed before any request). A plain object, so it can be passed
// around and logged. It carries none of the server's text: the page words an error from `code`
// through the copy table (models/error/constant.ts).
// It does not belong: the copy for a code (models/error) or the mapping from a response
// (services/api.ts).
import type { ErrorBody } from '../../services/generated/types.gen'

export type ErrorCode = ErrorBody['error']['code']
export type ClientErrorCode = 'network' | 'unknown' | 'validation'
export type ApiErrorCode = ErrorCode | ClientErrorCode

export type ApiError = {
  code: ApiErrorCode
  status?: number
  requestId?: string
  // The form fields a validation_failed envelope names, by path.
  fieldPaths?: readonly string[]
}
