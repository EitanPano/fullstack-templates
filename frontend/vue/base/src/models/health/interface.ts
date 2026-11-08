import type { HealthResponse, Readiness } from '@/services/generated/types.gen'

export type { HealthResponse, Readiness }
export type HealthStatus = HealthResponse['status'] | Readiness['status']
