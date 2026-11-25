// schema.ts belongs: this directory's contract. The frame sends its events here when the page
// hides; the body is a batch of JSON objects whose shape the product decides.
// It does not belong: business rules or HTTP handling (controller.ts).
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { errorResponses, jsonBody } from '../../../services/utils/openapi'
import { z } from '../../../services/utils/zod'

export const MAX_EVENTS = 100

export const SdkTelemetryBody = z
  .object({ events: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_EVENTS) })
  .openapi('SdkTelemetryBody')

export type SdkTelemetryBody = z.infer<typeof SdkTelemetryBody>

export const postSdkTelemetryRequest = { body: SdkTelemetryBody }

export function registerSdkTelemetry(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: 'post',
    path: '/api/sdk/v1/telemetry',
    operationId: 'postSdkTelemetry',
    tags: ['sdk'],
    summary: 'Events from the SDK frame; only the frame sends them',
    request: {
      headers: z.object({
        'x-sdk-key': z.string().openapi({ description: 'The publishable key of the integration' }),
      }),
      body: jsonBody(SdkTelemetryBody),
    },
    responses: {
      204: { description: 'The events were taken' },
      ...errorResponses(400, 403, 413, 429, 500),
    },
  })
}
