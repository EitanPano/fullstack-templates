// type.ts belongs: what a failed call looks like to a page. The server's codes come from shared/;
// the three below are the page's own (no response, a response that is not the envelope, a check
// that failed before any request). It does not belong: the copy for a code (models/error).
import type { ErrorCode } from '@shared/types/api'

export type ClientErrorCode = 'network' | 'unknown' | 'validation'
export type ApiErrorCode = ErrorCode | ClientErrorCode
