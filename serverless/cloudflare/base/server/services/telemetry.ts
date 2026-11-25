// telemetry.ts belongs: where the events of the SDK frame go. The default logs one line with the
// count and nothing of the events; a product replaces the body (a queue, a table, an analytics
// service) and keeps the signature. The caller awaits it before the 204, so a sink stays short or
// queues inside itself; one that throws is logged by class name alone and the answer stays 204.
import type { Logger } from './logger'

export type SdkTelemetry = { key: string; events: Record<string, unknown>[] }

export function recordSdkTelemetry(entry: SdkTelemetry, log: Logger): void | Promise<void> {
  log.info('sdk telemetry received', { count: entry.events.length })
}
