import pkg from '../../../package.json' with { type: 'json' }

import type { Request, RequestHandler, Response } from 'express'

import { healthCheck, type Resource } from '../../infra/dependency'
import type { HealthResponse, Readiness } from './schema'

// A controller holds the module's logic in its HTTP handlers, one per endpoint, named after the
// operation. Health owns no data, so it has no service.ts: liveness reads the process, readiness
// pings every dependency (infra/dependency.ts).
const startedAt = Date.now()

export function getHealth(_req: Request, res: Response): void {
  const health: HealthResponse = {
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    version: pkg.version,
  }
  res.json(health)
}

// 200 when every dependency answers, 503 when one is down; the body is the same shape.
// A factory: `list` is the seam the tests use; routes.ts mounts the default, which checks every
// dependency.
export function getReadiness(list?: readonly Resource[]): RequestHandler {
  return async (_req, res) => {
    const dependencies = await healthCheck(list)
    const degraded = Object.values(dependencies).includes('down')
    const readiness: Readiness = { status: degraded ? 'degraded' : 'ok', dependencies }
    res.status(degraded ? 503 : 200).json(readiness)
  }
}
