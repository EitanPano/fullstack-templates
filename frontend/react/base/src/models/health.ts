import type { HealthResponse } from '@/services/generated/types.gen'

// What the UI needs of the liveness endpoint. The contract owns the type; the model picks from it.
export type HealthView = Pick<HealthResponse, 'version' | 'uptimeSeconds'>
