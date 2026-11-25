export type SizeOptions = {
  win: Window
  report: (height: number) => void
}

/**
 * Reports the height of `html` now, and again whenever it changes: the loader sets the iframe to
 * it (F5). The first report is made at once, not at the observer's first turn, so a caller can
 * send it before anything that tells the host the unit has drawn.
 */
export function observeHeight({ win, report }: SizeOptions): () => void {
  const Observer = (win as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
  if (typeof Observer !== 'function') return () => undefined
  let last = -1
  const send = (value: number) => {
    const height = Math.ceil(value)
    if (height === last) return
    last = height
    report(height)
  }
  const measured = win.document.documentElement.getBoundingClientRect().height
  if (measured > 0) send(measured)
  const observer = new Observer((entries) => {
    const entry = entries[entries.length - 1]
    if (entry) send(entry.contentRect.height)
  })
  observer.observe(win.document.documentElement)
  return () => observer.disconnect()
}
