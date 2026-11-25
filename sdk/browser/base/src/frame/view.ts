// "Seen" is decided here, in the frame, never by the host (ADR 0020 F4): the caller's ratio of
// the target in the top page's viewport for a continuous dwell time, a visible page, a frame that
// is not a pixel, and, where the engine has IntersectionObserver v2, `isVisible` (not covered, not
// hidden). The report names the checks that ran, so the server can weigh an engine without v2. A
// module calls this on what it drew; the kernel never does.
const MIN_SIDE = 10
const STEPS = [0, 0.25, 0.5, 0.75, 1]

/** Whether the checks beyond the viewport ratio could run. */
export type Occlusion = 'checked' | 'unavailable'

export type ViewOptions = {
  /** The share of the target's pixels that must be in view, 0 to 1. */
  ratio: number
  /** How long it must stay so, in milliseconds. */
  dwellMs: number
  /** Called once, then the observer stops. */
  onView: (occlusion: Occlusion) => void
}

type Entry = { intersectionRatio: number; isVisible?: boolean }

/** Watches `target` and returns the function that stops it. The window is the target's own. */
export function observeView(target: Element, options: ViewOptions): () => void {
  const win = target.ownerDocument.defaultView
  const scope = win as unknown as {
    IntersectionObserver?: typeof IntersectionObserver
    IntersectionObserverEntry?: { prototype: object }
  } | null
  const Observer = scope?.IntersectionObserver
  if (!win || typeof Observer !== 'function') return () => undefined

  const v2 = 'isVisible' in (scope?.IntersectionObserverEntry?.prototype ?? {})
  let ratio = 0
  let covered = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let done = false

  const stop = () => {
    done = true
    clearTimeout(timer)
    timer = undefined
    observer.disconnect()
    win.document.removeEventListener('visibilitychange', evaluate)
    win.removeEventListener('resize', evaluate)
  }
  const seen = () =>
    ratio >= options.ratio &&
    !covered &&
    win.document.visibilityState === 'visible' &&
    win.innerWidth >= MIN_SIDE &&
    win.innerHeight >= MIN_SIDE

  function evaluate() {
    if (done) return
    if (!seen()) {
      clearTimeout(timer)
      timer = undefined
    } else if (timer === undefined) {
      timer = setTimeout(() => {
        stop()
        options.onView(v2 ? 'checked' : 'unavailable')
      }, options.dwellMs)
    }
  }

  const observer = new Observer(
    (entries) => {
      const entry = entries[entries.length - 1] as Entry | undefined
      if (!entry) return
      ratio = entry.intersectionRatio
      covered = v2 && entry.isVisible !== true
      evaluate()
    },
    {
      threshold: [...new Set([...STEPS, options.ratio])].sort((a, b) => a - b),
      // `trackVisibility` is asked for only where it exists: elsewhere it is ignored or refused.
      ...(v2 ? { trackVisibility: true, delay: 100 } : {}),
    },
  )
  observer.observe(target)
  win.document.addEventListener('visibilitychange', evaluate)
  win.addEventListener('resize', evaluate)
  return stop
}
