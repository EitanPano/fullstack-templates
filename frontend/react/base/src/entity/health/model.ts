import type { HealthResponse } from '@/shared/api'

// What the UI needs of the liveness endpoint. The contract owns the type; the model picks from it.
export type HealthView = Pick<HealthResponse, 'version' | 'uptimeSeconds'>
