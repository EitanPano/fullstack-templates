// schema.ts belongs: this directory's contract, the zod schemas of the two health bodies and the
// registration of both endpoints in the OpenAPI document. It is the leaf of the directory: the
// controller imports it, it imports only services/utils/.
// It does not belong: the checks themselves (controller.ts).
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { errorResponses, jsonResponse } from '../../services/utils/openapi'
import { z } from '../../services/utils/zod'

export const HealthResponse = z
  .object({
    status: z.literal('ok'),
    uptimeSeconds: z.number().int().nonnegative(),
    version: z.string(),
  })
  .openapi('HealthResponse')

export type HealthResponse = z.infer<typeof HealthResponse>

// Readiness is the same body on 200 and 503: callers read the status code, operators
// read the map. It is not the error envelope because nothing went wrong in the request.
export const Readiness = z
  .object({
    status: z.enum(['ok', 'degraded']),
    dependencies: z.record(z.string(), z.enum(['ok', 'down'])),
  })
  .openapi('Readiness')

export type Readiness = z.infer<typeof Readiness>

export function registerHealth(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: 'get',
    path: '/api/health',
    tags: ['health'],
    summary: 'Liveness check',
    responses: {
      200: jsonResponse('The service is up', HealthResponse),
      ...errorResponses(500),
    },
  })
  registry.registerPath({
    method: 'get',
    path: '/api/health/ready',
    tags: ['health'],
    summary: 'Readiness check',
    responses: {
      200: jsonResponse('Every dependency answered its ping', Readiness),
      503: jsonResponse('At least one dependency is down', Readiness),
      ...errorResponses(500),
    },
  })
}
