import type { HealthResponse, Readiness } from '@app/services/generated/types.gen'

export type { HealthResponse, Readiness }
export type HealthStatus = HealthResponse['status'] | Readiness['status']
