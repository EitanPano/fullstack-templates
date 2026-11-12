import type { ApiErrorCode } from './type'

export interface ApiErrorInit {
  readonly status: number
  readonly code: ApiErrorCode
  readonly requestId?: string | null
  readonly fieldErrors?: Record<string, string[]>
}

// A failed call as a page or a form helper reads it; `ApiError` (services/api-error.ts) is the one
// implementation.
export interface ApiFailure {
  readonly status: number
  readonly code: ApiErrorCode
  readonly requestId: string | null
  readonly fieldErrors?: Record<string, string[]>
}
