// controller.ts belongs: the handler of GET /api/sdk/v1/config. The kill switch is SDK_ENABLED,
// read when the request arrives, and the key's own switch, which the gate has resolved.
// It does not belong: the key or origin check (middleware/sdk-gate.ts).
import type { Request, Response } from 'express'

import { env } from '../../../config/env'
import type { SdkConfig } from './schema'

export function getSdkConfig(_req: Request, res: Response): void {
  const config: SdkConfig = { enabled: env.SDK_ENABLED && res.locals.sdk?.enabled === true }
  res.json(config)
}
