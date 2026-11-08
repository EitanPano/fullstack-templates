export const PRELOAD_RELOAD_KEY = 'preload-reloaded-at'
export const PRELOAD_RELOAD_WINDOW_MS = 30_000

// After a redeploy, an open tab asks for a chunk the new image no longer has and the dynamic import
// fails. One reload per window picks up the new index and its chunk names; a chunk that stays
// missing is left to the global error handler instead of reloading forever.
export function installPreloadReload(
  target: EventTarget = window,
  reload: () => void = () => {
    window.location.reload()
  },
): void {
  target.addEventListener('vite:preloadError', (event) => {
    const now = Date.now()
    try {
      const last = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY))
      if (last > 0 && now - last < PRELOAD_RELOAD_WINDOW_MS) return
      sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(now))
    } catch {
      // Storage blocked: reload anyway, as before.
    }
    event.preventDefault()
    reload()
  })
}
