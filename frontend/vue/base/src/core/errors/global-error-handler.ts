import type { App } from 'vue'

import { logger } from '@/core/providers/logger'

// Failures in a burst (one bad render often throws several times) show one toast.
const QUIET_MS = 5000

// The last net: an error a component threw (app.config.errorHandler) and a promise nobody
// handled (window `unhandledrejection`) are logged, redacted, and answered with `notify()`, which
// app/plugins.ts points at the notification store's errors.unexpected toast. core/ cannot import
// store/, so the toast comes in as a callback. The text of the error never reaches the user.
// Returns a function that removes the window listener.
export function installGlobalErrorHandler(app: App, notify: () => void): () => void {
  let lastNotified = Number.NEGATIVE_INFINITY

  const report = (message: string, error: unknown, info?: string) => {
    if (info === undefined) logger.error(message, error)
    else logger.error(message, error, info)
    const now = Date.now()
    if (now - lastNotified < QUIET_MS) return
    lastNotified = now
    notify()
  }

  app.config.errorHandler = (error, _instance, info) => {
    report('Unhandled error', error, info)
  }

  const onRejection = (event: Event) => {
    report('Unhandled promise rejection', (event as PromiseRejectionEvent).reason)
  }
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
