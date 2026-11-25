export type SizeOptions = {
  win: Window
  report: (height: number) => void
}

/** Reports the height of `html` whenever it changes: the loader sets the iframe to it (F5). */
export function observeHeight({ win, report }: SizeOptions): () => void {
  const Observer = (win as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
  if (typeof Observer !== 'function') return () => undefined
  let last = -1
  const observer = new Observer((entries) => {
    const entry = entries[entries.length - 1]
    if (!entry) return
    const height = Math.ceil(entry.contentRect.height)
    if (height === last) return
    last = height
    report(height)
  })
  observer.observe(win.document.documentElement)
  return () => observer.disconnect()
}
