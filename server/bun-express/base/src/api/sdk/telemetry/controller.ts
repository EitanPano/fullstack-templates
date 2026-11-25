// controller.ts belongs: the handler of POST /api/sdk/v1/telemetry. It hands the key and the
// events to the sink and answers 204 whatever the sink does: the frame sends on page hide and
// reads no answer.
// It does not belong: the key or origin check (middleware/sdk-gate.ts) or the sink's body
// (services/telemetry.ts).
import type { Request, Response } from 'express'

import { readInput } from '../../../middleware/validate'
import { log } from '../../../services/logger'
import { recordSdkTelemetry } from '../../../services/telemetry'
import { postSdkTelemetryRequest } from './schema'

export async function postSdkTelemetry(_req: Request, res: Response): Promise<void> {
  const { body } = readInput(res, postSdkTelemetryRequest)
  // The gate has resolved the key before any handler of the namespace runs.
  const key = res.locals.sdk?.key ?? ''
  try {
    await recordSdkTelemetry({ key, events: body.events })
  } catch (error) {
    log.warn('sdk telemetry sink failed', {
      requestId: res.locals.requestId,
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
  res.status(204).end()
}
