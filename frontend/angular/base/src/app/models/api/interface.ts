import type { ApiErrorCode } from './type'

export interface ApiErrorInit {
  readonly status: number
  readonly code: ApiErrorCode
  readonly requestId?: string | null
  readonly fieldErrors?: Record<string, string[]>
}
