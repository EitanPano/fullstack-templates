// controller.ts belongs: the handler of GET /api/sdk/v1/config. The loader draws only when both
// switches are on: SDK_ENABLED, read when the request arrives, and the key's own `enabled`, which
// the gate stored on the context.
// It does not belong: the key or origin check (middleware/sdk-gate.ts).
import { json, type Context } from '../../../middleware/handler'
import type { SdkConfig } from './schema'

export function getSdkConfig(ctx: Context): Response {
  const config: SdkConfig = { enabled: ctx.env.SDK_ENABLED && ctx.sdkKey?.enabled === true }
  return json(config)
}
