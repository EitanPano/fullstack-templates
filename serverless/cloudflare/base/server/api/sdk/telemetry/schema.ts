// schema.ts belongs: this directory's contract. SdkTelemetryBody is the one request the frame
// sends on page hide: 1 to 100 JSON objects, whatever fields the product's sink reads. The key
// header is documented as on `config`; an entity imports no other, so it repeats it.
// It does not belong: business rules or HTTP handling (controller.ts).
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { errorResponses, jsonBody } from '../../../services/utils/openapi'
import { z } from '../../../services/utils/zod'

export const SdkTelemetryBody = z
  .object({ events: z.array(z.record(z.string(), z.unknown())).min(1).max(100) })
  .openapi('SdkTelemetryBody')

export type SdkTelemetryBody = z.infer<typeof SdkTelemetryBody>

export const postSdkTelemetryRequest = { body: SdkTelemetryBody }

export function registerSdkTelemetry(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: 'post',
    path: '/api/sdk/v1/telemetry',
    operationId: 'postSdkTelemetry',
    tags: ['sdk'],
    summary: 'Events from the SDK frame, sent on page hide; the frame reads no answer',
    request: {
      headers: z.object({
        'x-sdk-key': z.string().openapi({ description: 'The publishable key of the integration' }),
      }),
      body: jsonBody(SdkTelemetryBody),
    },
    responses: {
      204: { description: 'The events were accepted' },
      ...errorResponses(400, 403, 413, 429, 500),
    },
  })
}
