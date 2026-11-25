// The frame's telemetry buffer, with the sending left to the caller (the one that owns a `fetch`).
// Items are kept only while consent allows, and only a plain JSON object: the server takes nothing
// else and answers 400 to the whole batch, so one bad item would lose the good ones. The buffer drains once when the page goes hidden or
// is left: both events usually fire, the second finds it empty. Listeners are attached with the
// first item, so a page that tracks nothing gets none.
// A `keepalive` request body is limited to 64 KiB by the browsers: a batch stays under it, and what
// does not fit waits for the next drain.
import { checkJsonObject } from '../protocol'

export const TELEMETRY_PATH = '/api/sdk/v1/telemetry'
const MAX_ITEMS = 100
const MAX_BATCH_BYTES = 60_000

export type TelemetryBuffer = {
  push(item: unknown): void
  flush(): void
  dispose(): void
}

export type TelemetryOptions = {
  allowed: () => boolean
  send: (batch: unknown[]) => void
  win: Window
}

// Bytes on the wire (UTF-8, plus the comma). An item went through JSON when it was pushed.
const sizeOf = (item: unknown): number => new TextEncoder().encode(JSON.stringify(item)).length + 1

export function createTelemetryBuffer(options: TelemetryOptions): TelemetryBuffer {
  const { win } = options
  const doc = win.document
  let items: unknown[] = []
  let attached = false

  const flush = () => {
    if (items.length === 0) return
    if (!options.allowed()) {
      items = []
      return
    }
    const batch: unknown[] = []
    let bytes = 0
    while (items.length > 0) {
      const size = sizeOf(items[0])
      // An item that alone does not fit can never be sent: it is dropped, not kept for ever.
      if (size > MAX_BATCH_BYTES) {
        items.shift()
        continue
      }
      if (bytes + size > MAX_BATCH_BYTES) break
      bytes += size
      batch.push(items.shift())
    }
    if (batch.length > 0) options.send(batch)
  }
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') flush()
  }
  const attach = () => {
    if (attached) return
    attached = true
    doc.addEventListener('visibilitychange', onVisibility)
    win.addEventListener('pagehide', flush)
  }

  return {
    push(item) {
      if (!options.allowed()) return
      // Run in a listener of the host page and from a module: it never throws, and keeps a copy.
      const checked = checkJsonObject(item, MAX_BATCH_BYTES)
      if (!checked.ok) return
      attach()
      if (items.length >= MAX_ITEMS) items.shift()
      items.push(checked.value)
    },
    flush,
    dispose() {
      doc.removeEventListener('visibilitychange', onVisibility)
      win.removeEventListener('pagehide', flush)
      attached = false
      items = []
    },
  }
}
