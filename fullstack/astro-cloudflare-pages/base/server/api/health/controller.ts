// controller.ts belongs: this directory's HTTP handlers, one exported function per endpoint,
// named after its operation. Health owns no data, so it has no service.ts: liveness reads the
// process, readiness pings the database.
// It does not belong: routing (functions/api/health/) or schemas (shared/schemas/health.ts).
import type { HealthResponse, Readiness } from '@shared/schemas/health'
import { sql } from 'drizzle-orm'

import pkg from '../../../package.json'
import { json, type Context } from '../../middleware/handler'

// workerd freezes the clock at global scope (Date.now() is 0 there), so the start is the isolate's
// first request.
let startedAt: number | undefined

export function getHealth(): Response {
  startedAt ??= Date.now()
  const health: HealthResponse = {
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    version: pkg.version,
  }
  return json(health)
}

// 200 when every dependency answers, 503 when one is down; the body is the same shape.
export async function getReadiness(ctx: Context): Promise<Response> {
  let database: 'ok' | 'down' = 'ok'
  try {
    await ctx.db.run(sql`select 1`)
  } catch (error) {
    database = 'down'
    ctx.log.warn('readiness: the database did not answer', {}, error)
  }
  const degraded = database === 'down'
  const readiness: Readiness = { status: degraded ? 'degraded' : 'ok', dependencies: { database } }
  return json(readiness, degraded ? 503 : 200)
}
