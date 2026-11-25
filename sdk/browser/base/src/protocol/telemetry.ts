// A buffer both sides use, with the sending left to the caller (the one that owns a `fetch`).
// Items are kept only while consent allows. The buffer drains once when the page goes hidden or
// is left: both events usually fire, the second finds it empty. Listeners are attached with the
// first item, so a page that tracks nothing gets none.
const MAX_ITEMS = 100

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

export function createTelemetryBuffer(options: TelemetryOptions): TelemetryBuffer {
  const { win } = options
  const doc = win.document
  let items: unknown[] = []
  let attached = false

  const flush = () => {
    if (items.length === 0) return
    const batch = items
    items = []
    if (options.allowed()) options.send(batch)
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
