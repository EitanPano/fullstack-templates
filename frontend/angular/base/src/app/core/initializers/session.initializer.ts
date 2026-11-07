import { inject, provideAppInitializer } from '@angular/core'

import { LoggerService } from '@app/core/providers/logger.service'
import { AuthStore } from '@app/store/auth.store'

// How long the start may wait for the API before the first render goes ahead as a visitor.
export const SESSION_RESTORE_TIMEOUT_MS = 5000

// Restores the session before the first navigation, so a guard reads who is signed in rather than
// guessing. With no session hint it calls nothing; it never rejects, and it never waits longer than
// SESSION_RESTORE_TIMEOUT_MS, so a down or hung API cannot block the start. On a timeout the app
// starts as a visitor and the hint stays, so a later 401 can still refresh.
export function provideSessionInitializer() {
  return provideAppInitializer(async () => {
    const auth = inject(AuthStore)
    const logger = inject(LoggerService)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => {
        resolve('timeout')
      }, SESSION_RESTORE_TIMEOUT_MS)
    })
    const outcome = await Promise.race([
      auth.restoreSession().then(() => 'restored' as const),
      timeout,
    ])
    clearTimeout(timer)
    if (outcome === 'timeout')
      logger.error('Restoring the session timed out; starting as a visitor')
  })
}
