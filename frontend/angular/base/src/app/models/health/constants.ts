import type { HealthStatus } from './interface'

export type HealthTone = 'success' | 'warning'

// How each status the contract declares reads on screen: the copy key and the badge tone.
export const HEALTH_STATUS: Record<
  HealthStatus,
  { readonly labelKey: string; readonly tone: HealthTone }
> = {
  ok: { labelKey: 'health.status.ok', tone: 'success' },
  degraded: { labelKey: 'health.status.degraded', tone: 'warning' },
}
