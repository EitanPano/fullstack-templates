import pkg from '../../../package.json' with { type: 'json' }

import { healthCheck, type Resource } from '../../infra/dependency'
import type { HealthResponse, Readiness } from './schema'

const startedAt = Date.now()

export function getHealth(): HealthResponse {
  return {
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    version: pkg.version,
  }
}

// Pings every dependency (infra/dependency.ts); `list` is the seam tests use.
export async function getReadiness(list?: readonly Resource[]): Promise<Readiness> {
  const dependencies = await healthCheck(list)
  const degraded = Object.values(dependencies).includes('down')
  return { status: degraded ? 'degraded' : 'ok', dependencies }
}
