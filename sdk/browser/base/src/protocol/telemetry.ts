// A buffer both sides use, with the sending left to the caller (the one that owns a `fetch`).
// Items are kept only while consent allows. The buffer drains once when the page goes hidden or
// is left: both events usually fire, the second finds it empty. Listeners are attached with the
// first item, so a page that tracks nothing gets none.
// A `keepalive` request body is limited to 64 KiB by the browsers: a batch stays under it, and what
// does not fit waits for the next drain.
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

// Bytes on the wire (UTF-8, plus the comma), or null for a value JSON cannot hold (a cycle, a BigInt).
function sizeOf(item: unknown): number | null {
  try {
    const text = JSON.stringify(item)
    return text === undefined ? null : new TextEncoder().encode(text).length + 1
  } catch {
    return null
  }
}

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
      // An item that cannot be serialised, or alone does not fit, can never be sent: it is
      // dropped, not kept for ever. This runs in a listener on the host page, so it never throws.
      if (size === null || size > MAX_BATCH_BYTES) {
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
      attach()
      if (items.length >= MAX_ITEMS) items.shift()
      items.push(item)
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
