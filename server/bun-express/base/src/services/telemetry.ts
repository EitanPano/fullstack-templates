// telemetry.ts belongs: where the SDK frame's telemetry goes. A product replaces the body of
// recordSdkTelemetry with its own sink (a queue, a table, a vendor); the default logs one line
// with the count and nothing of the events. The handler awaits it before the 204, so keep it
// short or queue inside it; a failure is logged and never changes the answer.
import { log } from './logger'

export type SdkTelemetry = { key: string; events: readonly Record<string, unknown>[] }

export function recordSdkTelemetry({ events }: SdkTelemetry): Promise<void> {
  log.info('sdk telemetry', { count: events.length })
  return Promise.resolve()
}
