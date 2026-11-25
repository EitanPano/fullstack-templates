// schema.ts belongs: this directory's contract. SdkConfig is the one schema of the namespace
// that ships to the SDK's generated types, so it is its own, not shared with another entity.
// It does not belong: business rules or HTTP handling (controller.ts).
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { errorResponses, jsonResponse } from '../../../services/utils/openapi'
import { z } from '../../../services/utils/zod'

export const SdkConfig = z.object({ enabled: z.boolean() }).openapi('SdkConfig')

export type SdkConfig = z.infer<typeof SdkConfig>

export function registerSdkConfig(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: 'get',
    path: '/api/sdk/v1/config',
    operationId: 'getSdkConfig',
    tags: ['sdk'],
    summary: 'The SDK kill switch: false tells a loader to draw nothing',
    request: {
      headers: z.object({
        'x-sdk-key': z.string().openapi({ description: 'The publishable key of the integration' }),
      }),
    },
    responses: {
      200: jsonResponse('Whether the SDK is switched on', SdkConfig),
      ...errorResponses(403, 429, 500),
    },
  })
}
