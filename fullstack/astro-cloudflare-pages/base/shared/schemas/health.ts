// health.ts belongs: the bodies of the two health endpoints. It does not belong: the checks
// themselves (server/api/health/controller.ts).
import { z } from 'zod'

export const HealthResponse = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().int().nonnegative(),
  version: z.string(),
})

export type HealthResponse = z.infer<typeof HealthResponse>

// The same body on 200 and 503: a caller reads the status code, an operator reads the map. It is
// not the error envelope because nothing went wrong in the request.
export const Readiness = z.object({
  status: z.enum(['ok', 'degraded']),
  dependencies: z.record(z.string(), z.enum(['ok', 'down'])),
})

export type Readiness = z.infer<typeof Readiness>
