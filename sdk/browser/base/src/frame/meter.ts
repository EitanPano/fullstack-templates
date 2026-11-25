import type { Occlusion } from '../protocol'

// "Seen" is decided here, in the frame, never by the host (ADR 0020 F4): at least half the pixels
// in the top page's viewport for a continuous second, a visible page, a frame that is not a
// pixel, and, where the engine has IntersectionObserver v2, `isVisible` (not covered, not
// hidden). The report names the checks that ran, so the server can weigh an engine without v2.
const MIN_RATIO = 0.5
const DWELL_MS = 1000
const MIN_SIDE = 10

export type MeterOptions = {
  win: Window
  target: Element
  onView: (occlusion: Occlusion) => void
}

type Entry = { intersectionRatio: number; isVisible?: boolean }

export function createMeter({ win, target, onView }: MeterOptions): { stop(): void } {
  const scope = win as unknown as {
    IntersectionObserver?: typeof IntersectionObserver
    IntersectionObserverEntry?: { prototype: object }
  }
  const Observer = scope.IntersectionObserver
  if (typeof Observer !== 'function') return { stop: () => undefined }

  const v2 = 'isVisible' in (scope.IntersectionObserverEntry?.prototype ?? {})
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
    ratio >= MIN_RATIO &&
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
        onView(v2 ? 'checked' : 'unavailable')
      }, DWELL_MS)
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
    // `trackVisibility` is asked for only where it exists: elsewhere it is ignored or refused.
    { threshold: [0, 0.25, 0.5, 0.75, 1], ...(v2 ? { trackVisibility: true, delay: 100 } : {}) },
  )
  observer.observe(target)
  win.document.addEventListener('visibilitychange', evaluate)
  win.addEventListener('resize', evaluate)
  return { stop }
}
