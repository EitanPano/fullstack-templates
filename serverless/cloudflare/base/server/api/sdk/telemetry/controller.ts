// controller.ts belongs: the handler of POST /api/sdk/v1/telemetry. It hands the key and the events
// to the sink (services/telemetry.ts), waits for it, and answers 204. A sink that throws is logged
// by its error class alone and never changes the answer: the frame reads none.
import { noContent, type Context } from '../../../middleware/handler'
import { readInput } from '../../../middleware/validate'
import { recordSdkTelemetry } from '../../../services/telemetry'
import { postSdkTelemetryRequest } from './schema'

export async function postSdkTelemetry(ctx: Context): Promise<Response> {
  const { body } = readInput(ctx, postSdkTelemetryRequest)
  const key = ctx.request.headers.get('x-sdk-key') ?? ''
  try {
    await recordSdkTelemetry({ key, events: body.events }, ctx.log)
  } catch (error) {
    ctx.log.warn('the SDK telemetry sink failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
  return noContent()
}
