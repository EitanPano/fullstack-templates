// controller.ts belongs: the handler of GET /api/sdk/v1/config. The kill switch is SDK_ENABLED,
// read when the request arrives.
// It does not belong: the key or origin check (middleware/sdk-gate.ts).
import { json, type Context } from '../../../middleware/handler'
import type { SdkConfig } from './schema'

export function getSdkConfig(ctx: Context): Response {
  const config: SdkConfig = { enabled: ctx.env.SDK_ENABLED }
  return json(config)
}
